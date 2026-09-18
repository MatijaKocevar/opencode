import { createMemo, createSignal, onCleanup, onMount, Show } from "solid-js"
import { produce } from "solid-js/store"
import { useKeyboard } from "@opentui/solid"
import { useTheme } from "../../context/theme"
import { useSDK } from "../../context/sdk"
import { useSync } from "../../context/sync"
import { SplitBorder } from "../../ui/border"
import { useOpencodeModeStack } from "../../keymap"
import type { SecureInputRequest } from "@opencode-ai/sdk/v2"

const SECURE_INPUT_MODE = "secure-input"

export function SecureInputPrompt(props: { request: SecureInputRequest; directory?: string }) {
  const sdk = useSDK()
  const sync = useSync()
  const { theme } = useTheme()
  const modeStack = useOpencodeModeStack()

  const [password, setPassword] = createSignal("")
  const mask = createMemo(() => "•".repeat(password().length))

  function dismiss() {
    sync.set(
      "secure_input",
      props.request.sessionID,
      produce((draft) => {
        if (!draft) return
        const index = draft.findIndex((item) => item.id === props.request.id)
        if (index >= 0) draft.splice(index, 1)
      }),
    )
  }

  function submit() {
    const value = password()
    if (!value) return
    setPassword("")
    void sdk.client.secureInput
      .submit({
        requestID: props.request.id,
        directory: props.directory,
        input: value,
      })
      .then(dismiss, dismiss)
  }

  function cancel() {
    setPassword("")
    void sdk.client.secureInput
      .cancel({
        requestID: props.request.id,
        directory: props.directory,
      })
      .then(dismiss, dismiss)
  }

  onMount(() => {
    const popMode = modeStack.push(SECURE_INPUT_MODE)
    onCleanup(popMode)
  })

  useKeyboard((key) => {
    if (key.name === "return" || key.name === "kpenter" || key.name === "linefeed") {
      submit()
      return
    }
    if (key.name === "escape") {
      cancel()
      return
    }
    if (key.name === "backspace") {
      setPassword((value) => value.slice(0, -1))
      return
    }
    if (key.ctrl || key.meta || key.super || key.option) return
    if (key.name === "space") {
      setPassword((value) => value + " ")
      return
    }
    if (key.sequence.length === 1) {
      const code = key.sequence.charCodeAt(0)
      if (code >= 32 && code < 127) {
        setPassword((value) => value + key.sequence)
      }
    }
  })

  return (
    <box
      backgroundColor={theme.backgroundPanel}
      border={["left"]}
      borderColor={theme.accent}
      customBorderChars={SplitBorder.customBorderChars}
    >
      <box gap={1} paddingLeft={1} paddingRight={3} paddingTop={1} paddingBottom={1}>
        <box paddingLeft={1} gap={1}>
          <text fg={theme.secondary}>Password required</text>
          <text fg={theme.text}>{props.request.prompt}</text>
          <Show when={props.request.command}>
            <text fg={theme.textMuted}>{props.request.command}</text>
          </Show>
          <box flexDirection="row" gap={1}>
            <text fg={theme.text}>{mask()}</text>
            <text fg={theme.primary}>▊</text>
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
          <text fg={theme.text}>
            enter <span style={{ fg: theme.textMuted }}>submit</span>
          </text>
          <text fg={theme.text}>
            esc <span style={{ fg: theme.textMuted }}>cancel</span>
          </text>
        </box>
      </box>
    </box>
  )
}
