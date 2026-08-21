import { createSignal, Show, type Component } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { DockPrompt } from "@opencode-ai/session-ui/dock-prompt"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import type { SecureInputRequest } from "@opencode-ai/sdk/v2"

export const SessionSecureInputDock: Component<{ request: SecureInputRequest; onSubmit: () => void }> = (props) => {
  const sdk = useSDK()
  const language = useLanguage()
  const [value, setValue] = createSignal("")
  const [responding, setResponding] = createSignal(false)

  const submit = async () => {
    if (responding()) return
    const input = value()
    if (!input) return
    setResponding(true)
    props.onSubmit()
    try {
      await sdk().client.secureInput.submit({
        requestID: props.request.id,
        directory: sdk().directory,
        input,
      })
    } catch {
      setResponding(false)
    }
  }

  const cancel = async () => {
    if (responding()) return
    setResponding(true)
    props.onSubmit()
    try {
      await sdk().client.secureInput.cancel({ requestID: props.request.id, directory: sdk().directory })
    } catch {
      setResponding(false)
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
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <input
          type="password"
          value={value()}
          autofocus
          disabled={responding()}
          placeholder="Password"
          onInput={(event) => setValue(event.currentTarget.value)}
        />
      </form>
    </DockPrompt>
  )
}
