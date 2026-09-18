import { createSignal, Show, type Component } from "solid-js"
import { produce } from "solid-js/store"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/session-ui/dock-prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import type { SecureInputRequest } from "@opencode-ai/sdk/v2"

export const SessionSecureInputDock: Component<{ request: SecureInputRequest; onSubmit: () => void }> = (props) => {
  const sdk = useSDK()
  const sync = useSync()
  const language = useLanguage()
  const [value, setValue] = createSignal("")
  const [responding, setResponding] = createSignal(false)
  let input: HTMLInputElement | undefined

  const clear = () => {
    setValue("")
    if (input) input.value = ""
  }

  const dismiss = () => {
    sync().set(
      "secure_input",
      props.request.sessionID,
      produce((draft) => {
        if (!draft) return
        const index = draft.findIndex((item) => item.id === props.request.id)
        if (index >= 0) draft.splice(index, 1)
      }),
    )
  }

  const submit = async () => {
    if (responding()) return
    const password = value()
    if (!password) return
    clear()
    setResponding(true)
    props.onSubmit()
    try {
      await sdk().client.secureInput.submit({
        requestID: props.request.id,
        directory: sdk().directory,
        input: password,
      })
    } finally {
      dismiss()
    }
  }

  const cancel = async () => {
    if (responding()) return
    clear()
    setResponding(true)
    props.onSubmit()
    try {
      await sdk().client.secureInput.cancel({ requestID: props.request.id, directory: sdk().directory })
    } finally {
      dismiss()
    }
  }

  return (
    <DockPrompt
      kind="permission"
      header={
        <div data-slot="permission-row" data-variant="header">
          <span data-slot="permission-icon">
            <Icon name="warning" size="normal" />
          </span>
          <div data-slot="permission-header-title">Password required</div>
        </div>
      }
      footer={
        <>
          <div />
          <div data-slot="permission-footer-actions">
            <Button variant="ghost" size="normal" onClick={() => void cancel()} disabled={responding()}>
              {language.t("ui.common.dismiss")}
            </Button>
            <Button variant="primary" size="normal" onClick={() => void submit()} disabled={responding()}>
              {language.t("ui.common.submit")}
            </Button>
          </div>
        </>
      }
    >
      <div data-slot="permission-row">
        <span data-slot="permission-spacer" aria-hidden="true" />
        <div data-slot="permission-hint">{props.request.prompt}</div>
      </div>
      <Show when={props.request.command}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <code class="text-12-regular text-text-base break-all">{props.request.command}</code>
        </div>
      </Show>
      <input
        ref={input}
        type="password"
        value={value()}
        autofocus
        disabled={responding()}
        placeholder="Password"
        autocomplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        data-form-type="other"
        onInput={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return
          event.preventDefault()
          void submit()
        }}
      />
    </DockPrompt>
  )
}
