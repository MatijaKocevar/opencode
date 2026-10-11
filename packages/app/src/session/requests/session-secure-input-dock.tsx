import { Show, createSignal, type Component } from "solid-js"
import type { SecureInputRequest } from "@opencode/client/promise"
import { Button } from "@opencode/ui/button"
import { TextInput } from "@opencode/ui/text-input"
import { DockPrompt } from "@opencode/session-ui/dock-prompt"
import { Icon } from "@opencode/ui/icon"

export const SessionSecureInputDock: Component<{
  request: SecureInputRequest
  responding: boolean
  onSubmit: (input: string) => void
  onCancel: () => void
}> = (props) => {
  const [value, setValue] = createSignal("")

  const submit = () => {
    const input = value()
    if (!input) return
    setValue("")
    props.onSubmit(input)
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
            <Button variant="ghost" size="normal" onClick={() => props.onCancel()} disabled={props.responding}>
              Cancel
            </Button>
            <Button variant="submit" size="normal" onClick={submit} disabled={props.responding || !value()}>
              Submit
            </Button>
          </div>
        </>
      }
    >
      <div data-slot="permission-row">
        <span data-slot="permission-spacer" aria-hidden="true" />
        <div data-slot="permission-patterns">
          <span class="text-12-regular text-text-base break-all">{props.request.prompt}</span>
        </div>
      </div>
      <Show when={props.request.command}>
        <div data-slot="permission-row">
          <span data-slot="permission-spacer" aria-hidden="true" />
          <div data-slot="permission-hint">
            <code class="text-12-regular text-text-base break-all">{props.request.command}</code>
          </div>
        </div>
      </Show>
      <div data-slot="permission-row">
        <span data-slot="permission-spacer" aria-hidden="true" />
        <TextInput
          type="password"
          appearance="large"
          class="!w-full self-stretch"
          value={value()}
          disabled={props.responding}
          onInput={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
          }}
        />
      </div>
    </DockPrompt>
  )
}
