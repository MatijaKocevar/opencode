import { createMemo, createSignal, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { SecureInputRequest } from "@opencode/client"
import { useTheme } from "../../context/theme"
import { useData } from "../../context/data"
import { SplitBorder } from "../../ui/border"
import { Keymap } from "../../context/keymap"

export function SecureInputPrompt(props: { request: SecureInputRequest; directory?: string }) {
  const data = useData()
  const theme = useTheme()
  const [password, setPassword] = createSignal("")
  const mask = createMemo(() => "•".repeat(password().length))

  function submit() {
    const value = password()
    if (!value) return
    setPassword("")
    void data.session.secureInput
      .submit({ sessionID: props.request.sessionID, requestID: props.request.id, input: value })
      .catch(() => undefined)
  }

  function cancel() {
    setPassword("")
    void data.session.secureInput
      .cancel({ sessionID: props.request.sessionID, requestID: props.request.id })
      .catch(() => undefined)
  }

  Keymap.createLayer(() => ({
    mode: "modal",
    commands: [
      { bind: "escape", title: "Cancel password prompt", group: "Secure input", run: cancel },
      { bind: "return", title: "Submit password", group: "Secure input", run: submit },
    ],
  }))

  useKeyboard((key) => {
    if (key.name === "return" || key.name === "kpenter" || key.name === "linefeed") return
    if (key.name === "escape") return
    if (key.name === "backspace") return setPassword((value) => value.slice(0, -1))
    if (key.ctrl || key.meta || key.super || key.option) return
    if (key.name === "space") return setPassword((value) => value + " ")
    if (key.sequence.length === 1) {
      const code = key.sequence.charCodeAt(0)
      if (code >= 32 && code < 127) setPassword((value) => value + key.sequence)
    }
  })

  return (
    <box
      backgroundColor={theme.background.raised.base}
      border={["left"]}
      borderColor={theme.text.feedback.warning.base}
      customBorderChars={SplitBorder.customBorderChars}
    >
      <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1}>
        <box paddingLeft={1} gap={1}>
          <text fg={theme.text.feedback.warning.base}>Password required</text>
          <text fg={theme.text.base}>{props.request.prompt}</text>
          <Show when={props.request.command}>
            <text fg={theme.text.muted}>{props.request.command}</text>
          </Show>
          <box flexDirection="row" gap={1}>
            <text fg={theme.text.base}>{mask()}</text>
            <text fg={theme.text.action.primary.base}>▊</text>
          </box>
        </box>
      </box>
      <box
        flexDirection="row"
        flexShrink={0}
        gap={2}
        paddingLeft={2}
        paddingRight={3}
        paddingBottom={1}
        justifyContent="space-between"
      >
        <box flexDirection="row" gap={2}>
          <text fg={theme.text.base}>
            enter <span style={{ fg: theme.text.muted }}>submit</span>
          </text>
          <text fg={theme.text.base}>
            esc <span style={{ fg: theme.text.muted }}>cancel</span>
          </text>
        </box>
      </box>
    </box>
  )
}
