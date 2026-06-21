"""
Replace the streaming handleSend function with non-streaming + fix related references.
Run this from the backend project root.
"""
import re

FILE = r'D:\Projects\cuton\apps\web\app\dashboard\study\page.tsx'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Find and replace the handleSend function
# Find start and end positions
start_marker = '// Send chat message (STREAMING)'
end_marker = '// Enter to send'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx >= 0 and end_idx > start_idx:
    # Extract the text so we can see the exact content
    old_func_text = content[start_idx:end_idx]
    
    # Build the new function text
    new_func_text = '''  // ---------------------------------------------------------------------------
  // Send chat message
  // ---------------------------------------------------------------------------

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !activeSessionId || sending) return;

    setInput("");
    setSending(true);
    setError(null);
    setPendingSuggestion(null);
    setJournalConfirmed(false);

    // Optimistic user message
    const tempUserMsg: StudyMessageResponse = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      metadata: {},
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const response = await chatSend(activeSessionId, { message: text });

      // Add the assistant message
      const assistantMsg: StudyMessageResponse = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: response.reply,
        metadata: {},
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Show suggestions if any
      if (response.journal_suggestion || response.quiz_suggestion) {
        setPendingSuggestion({
          journal: response.journal_suggestion
            ? { ...response.journal_suggestion, sessionId: activeSessionId }
            : undefined,
          quiz: response.quiz_suggestion ?? undefined,
        });
      }

      // Update session list + title
      const updatedSessions = await listStudySessions();
      setSessions(updatedSessions);
      if (sessionTitle === "New Study Session") {
        const detail = await getStudySession(activeSessionId);
        setSessionTitle(detail.title);
      }
    } catch (err: unknown) {
      setError(extractErrorMessage(err));
      // Remove optimistic user message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
    }
  }, [input, activeSessionId, sessionTitle, sending]);'''

    content = content[:start_idx] + new_func_text + content[end_idx:]
    print(f'1. handleSend replaced ({len(old_func_text)} chars -> {len(new_func_text)} chars)')
else:
    print(f'1. WARNING: Could not find handleSend function. start_marker at {start_idx}, end_marker at {end_idx}')

# Step 2: Fix the `as StudyMessageResponse` type cast for non-streaming messages
# This handles the allMessages array - remove the streaming placeholder
old_all_messages = '''  const allMessages = [
    ...messages,
    ...(streamingContent
      ? [
          {
            id: `${STREAMING_ID_PREFIX}current`,
            role: "assistant" as const,
            content: streamingContent,
            metadata: {} as Record<string, unknown>,
            created_at: new Date().toISOString(),
          } as StudyMessageResponse,
        ]
      : []),
  ];'''

if old_all_messages in content:
    content = content.replace(old_all_messages, '  const allMessages = messages;')
    print('2. allMessages simplified')
else:
    # Try to find it differently
    idx = content.find('const allMessages')
    if idx >= 0:
        end_idx = content.find(';\n\n', idx) + 1
        print(f'2. Found allMessages at {idx}, showing content:')
        print(repr(content[idx:idx+400]))
    else:
        print('2. allMessages not found')

# Step 3: Remove isStreaming variable from message map
old_streaming_var = '                    const isStreaming = msg.id.startsWith(STREAMING_ID_PREFIX);\n                    const isUser = msg.role === "user";'
if old_streaming_var in content:
    content = content.replace(old_streaming_var, '                    const isUser = msg.role === "user";')
    print('3. Removed isStreaming var from message map')
else:
    print('3. WARNING: streaming var not found in message map')

# Step 4: Remove streaming glow class
old_glow = '                        } ${isStreaming ? "animate-pulse-glow" : ""}`}>'
if old_glow in content:
    content = content.replace(old_glow, '                        }`}>')
    print('4. Removed streaming glow class')
else:
    print('4. WARNING: glow class not found')

# Step 5: Remove streaming dots from message header
old_dots = '''                            {isStreaming && (
                              <span className="flex items-center gap-0.5 ml-auto">
                                <span className="w-1 h-1 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "0ms" }} />
                                <span className="w-1 h-1 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "150ms" }} />
                                <span className="w-1 h-1 rounded-full bg-green-accent animate-bounce border border-ink" style={{ animationDelay: "300ms" }} />
                              </span>
                            )}'''
if old_dots in content:
    content = content.replace(old_dots, '')
    print('5. Removed streaming dots')
else:
    print('5. WARNING: streaming dots not found')

# Step 6: Remove streaming cursor
old_cursor = '                            {isStreaming && <span className="inline-block w-1.5 h-4 bg-green-accent/60 ml-0.5 animate-pulse align-text-bottom" />}'
if old_cursor in content:
    content = content.replace(old_cursor, '')
    print('6. Removed streaming cursor')
else:
    print('6. WARNING: streaming cursor not found')

# Step 7: Fix typing indicator condition
old_typing = '{sending && !streamingContent && ('
if old_typing in content:
    content = content.replace(old_typing, '{sending && (')
    print('7. Fixed typing indicator')
else:
    print('7. WARNING: typing indicator not found')

# Step 8: Fix textarea disabled
content = content.replace(
    'placeholder="Ask your Study Buddy anything\u2026" rows={1} disabled={isStreaming}',
    'placeholder="Ask your Study Buddy anything\u2026" rows={1} disabled={sending}'
)
print('8. Textarea disabled fixed')

# Step 9: Fix send button disabled
content = content.replace(
    'onClick={handleSend} disabled={isStreaming || !input.trim() || !activeSessionId}',
    'onClick={handleSend} disabled={sending || !input.trim() || !activeSessionId}'
)
print('9. Send button disabled fixed')

# Step 10: Check if chatSendStream still referenced anywhere
remaining = content.count('chatSendStream')
print(f'\n10. Remaining chatSendStream references: {remaining}')

remaining_stream = content.count('STREAMING_ID_PREFIX')
print(f'11. Remaining STREAMING_ID_PREFIX references: {remaining_stream}')

remaining_iscr = content.count('isStreaming')
print(f'12. Remaining isStreaming references: {remaining_iscr}')

remaining_sc = content.count('streamingContent')
print(f'13. Remaining streamingContent references: {remaining_sc}')

# Write back
with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print('\nDone!')
