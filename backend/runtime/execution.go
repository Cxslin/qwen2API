package runtime

import (
	"context"
	"strings"

	"qwen2api-go/toolcall"
)

type Event struct {
	Type          string
	Content       string
	ReasoningText string
	Raw           map[string]any
}

type Completion struct {
	AnswerText    string
	ReasoningText string
	Events        []Event
	ToolCalls     []toolcall.ParsedToolCall
	FinishReason  string
}

type Executor func(ctx context.Context, onEvent func(Event) error) error

type RuntimeAttemptState struct {
	AnswerText            string
	ReasoningText         string
	ToolCalls             []toolcall.ParsedToolCall
	BlockedToolNames      []string
	FinishReason          string
	EmptyUpstreamResponse bool
	RawEvents             []map[string]any
	EmittedVisibleOutput  bool
	StageMetrics          map[string]float64
}

type RuntimeExecutionResult struct {
	State  RuntimeAttemptState
	ChatID string
	Acc    any
}

type RuntimeToolDirective struct {
	ToolBlocks []map[string]any
	StopReason string
}

func Run(ctx context.Context, exec Executor) (Completion, error) {
	result := Completion{FinishReason: "stop"}
	err := exec(ctx, func(event Event) error {
		result.Events = append(result.Events, event)
		result.AnswerText += event.Content
		result.ReasoningText += event.ReasoningText
		return nil
	})
	if strings.TrimSpace(result.AnswerText) == "" && strings.TrimSpace(result.ReasoningText) == "" {
		result.FinishReason = "empty"
	}
	return result, err
}

func CollectTextCompletion(ctx context.Context, exec Executor, tools []map[string]any) (Completion, error) {
	result := Completion{FinishReason: "stop"}
	sieve := toolcall.NewToolSieve(tools)
	err := exec(ctx, func(event Event) error {
		result.Events = append(result.Events, event)
		if event.Type != "delta" && event.Type != "" {
			return nil
		}
		if event.ReasoningText != "" {
			result.ReasoningText += event.ReasoningText
			return nil
		}
		if event.Content == "" {
			return nil
		}
		result.AnswerText += event.Content
		if len(tools) > 0 && len(result.ToolCalls) == 0 {
			for _, sieveEvent := range sieve.ProcessChunk(event.Content) {
				if sieveEvent.Type == "tool_calls" && len(sieveEvent.Calls) > 0 {
					result.ToolCalls = toolcall.DedupeToolCalls(sieveEvent.Calls)
					result.FinishReason = "tool_calls"
				}
			}
		}
		return nil
	})
	if len(tools) > 0 && len(result.ToolCalls) == 0 {
		for _, sieveEvent := range sieve.Flush() {
			if sieveEvent.Type == "tool_calls" && len(sieveEvent.Calls) > 0 {
				result.ToolCalls = toolcall.DedupeToolCalls(sieveEvent.Calls)
				result.FinishReason = "tool_calls"
				break
			}
		}
	}
	if len(tools) > 0 && len(result.ToolCalls) == 0 {
		result.ToolCalls = toolcall.ParseToolCalls(result.AnswerText, tools)
		if len(result.ToolCalls) > 0 {
			result.FinishReason = "tool_calls"
		}
	}
	if strings.TrimSpace(result.AnswerText) == "" && strings.TrimSpace(result.ReasoningText) == "" && len(result.ToolCalls) == 0 {
		result.FinishReason = "empty"
	}
	return result, err
}

func ParseToolDirectiveOnce(state RuntimeAttemptState, tools []map[string]any) RuntimeToolDirective {
	if len(state.ToolCalls) > 0 {
		return RuntimeToolDirective{ToolBlocks: toolBlocks(state.ToolCalls), StopReason: "tool_use"}
	}
	if len(tools) > 0 && state.AnswerText != "" {
		calls := toolcall.ParseToolCalls(state.AnswerText, tools)
		if len(calls) > 0 {
			return RuntimeToolDirective{ToolBlocks: toolBlocks(calls), StopReason: "tool_use"}
		}
		if HasTextualToolMarker(state.AnswerText) {
			return RuntimeToolDirective{
				ToolBlocks: []map[string]any{{"type": "text", "text": "Invalid tool-call format was blocked. Retry the current request with a valid tool call."}},
				StopReason: "end_turn",
			}
		}
	}
	if strings.TrimSpace(state.AnswerText) == "" && strings.TrimSpace(state.ReasoningText) == "" {
		return RuntimeToolDirective{ToolBlocks: []map[string]any{{"type": "text", "text": "Upstream mengembalikan respons kosong. Silakan periksa akun di menu Manajemen Akun."}}, StopReason: "end_turn"}
	}
	return RuntimeToolDirective{ToolBlocks: []map[string]any{{"type": "text", "text": state.AnswerText}}, StopReason: "end_turn"}
}

func BuildToolDirective(state RuntimeAttemptState, tools []map[string]any) RuntimeToolDirective {
	return ParseToolDirectiveOnce(state, tools)
}

func ToolDirectiveVisibleText(directive RuntimeToolDirective, fallbackText string) string {
	if directive.StopReason == "tool_use" {
		return ""
	}
	parts := []string{}
	sawText := false
	for _, block := range directive.ToolBlocks {
		if block["type"] != "text" {
			continue
		}
		sawText = true
		if text, ok := block["text"].(string); ok && text != "" {
			parts = append(parts, text)
		}
	}
	if sawText {
		return SanitizeVisibleText(strings.Join(parts, ""))
	}
	return SanitizeVisibleText(fallbackText)
}

func HasTextualToolMarker(text string) bool {
	if strings.TrimSpace(text) == "" {
		return false
	}
	lowered := strings.ToLower(text)
	for _, marker := range []string{
		"<|qnml|tool_calls", "</|qnml|tool_calls", "<|qnml|invoke", "</|qnml|invoke",
		"<|qnml|parameter", "</|qnml|parameter", "<tool_calls", "</tool_calls",
		"<invoke", "</invoke", "<tool_call", "</tool_call", "##tool_call##", "##end_call##",
		"function.name:", "function.arguments:", "qnml|tool_calls", "qnml|invoke", "qnml|parameter",
	} {
		if strings.Contains(lowered, marker) {
			return true
		}
	}
	return false
}

func SanitizeVisibleText(text string) string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	for _, marker := range []string{"<|QNML|tool_calls", "</|QNML|tool_calls", "<tool_calls", "</tool_calls", "##TOOL_CALL##", "##END_CALL##"} {
		text = strings.ReplaceAll(text, marker, "")
		text = strings.ReplaceAll(text, strings.ToLower(marker), "")
	}
	return text
}

func toolBlocks(calls []toolcall.ParsedToolCall) []map[string]any {
	blocks := make([]map[string]any, 0, len(calls))
	for _, call := range calls {
		input := call.Input
		if input == nil {
			input = map[string]any{}
		}
		blocks = append(blocks, map[string]any{
			"type":  "tool_use",
			"id":    call.ID,
			"name":  call.Name,
			"input": input,
		})
	}
	return blocks
}
