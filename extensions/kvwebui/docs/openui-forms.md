# Forms

Form(name: string, buttons: Buttons, fields?: FormControl[]) — Form container with fields and explicit action buttons
FormControl(label: string, input: Input | TextArea | Select | DatePicker | Slider | CheckBoxGroup | RadioGroup | Chips | OptionCards, hint?: string) — Field with label, input component, and optional hint text
Label(text: string) — Text label
Input(name: string, placeholder?: string, type?: "text" | "email" | "password" | "number" | "url", rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)
TextArea(name: string, placeholder?: string, rows?: number, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)
Select(name: string, items: SelectItem[], placeholder?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>, size?: "small" | "medium" | "large")
SelectItem(value: string, label: string) — Option for Select
DatePicker(name: string, mode?: "single" | "range", rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<any>)
Slider(name: string, variant: "continuous" | "discrete", min: number, max: number, step?: number, defaultValue?: number[], label?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<number[]>) — Numeric slider input; supports continuous and discrete (stepped) variants
CheckBoxGroup(name: string, items: CheckBoxItem[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<Record<string, boolean>>)
CheckBoxItem(label: string, description: string, name: string, defaultChecked?: boolean)
RadioGroup(name: string, items: RadioItem[], defaultValue?: string, rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, value?: $binding<string>)
RadioItem(label: string, description: string, value: string)
SwitchGroup(name: string, items: SwitchItem[], variant?: "clear" | "card" | "sunk", value?: $binding<Record<string, boolean>>) — Group of switch toggles
SwitchItem(label?: string, description?: string, name: string, defaultChecked?: boolean) — Individual switch toggle
Chips(name: string, type?: "single" | "multiple", items?: ChipItem[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, defaultValue?: string | string[]) — A form field of compact selectable chips for choosing one or many short options; the selection is stored under `name`.
ChipItem(value: string, label: string, icon?: Icon, disabled?: boolean) — A single selectable chip inside a Chips group, with a value, label and optional icon.
OptionCards(name: string, type?: "single" | "multiple", items?: OptionCard[], rules?: {required?: boolean, email?: boolean, url?: boolean, numeric?: boolean, min?: number, max?: number, minLength?: number, maxLength?: number, pattern?: string}, defaultValue?: string | string[]) — A form field of selectable cards (title, optional subtitle, optional icon or image) laid out in a responsive grid for choosing one or many options; the selection is stored under `name`.
OptionCard(value: string, title: string, subtitle?: string, topContent?: Icon | Image, disabled?: boolean) — A single selectable card inside an OptionCards group, with a value, title, optional subtitle and an optional Icon or Image on top.
- Chips: compact single/multiple selection pills. Use ChipItem references for each option.
- OptionCards: larger selectable cards with title, subtitle and an optional Icon or Image on top. Use OptionCard references for each option.
- For Form fields, define EACH FormControl as its own reference — do NOT inline all controls in one array. This allows progressive field-by-field streaming.
- NEVER nest Form inside Form — each Form should be a standalone container.
- Form requires explicit buttons. Always pass a Buttons(...) reference as the second Form argument: Form(name, buttons, fields).
- rules is an optional object: {required: true, email: true, minLength: 8, maxLength: 100}
- Available rules: required, email, min, max, minLength, maxLength, pattern, url, numeric
- The renderer shows error messages automatically — do NOT generate error text in the UI
- Conditional fields: $country == "US" ? stateField : $country == "UK" ? postcodeField : addressField
- Edit form in Modal: Modal("Edit", $showEdit, [Form("edit", Buttons([saveBtn, cancelBtn]), [fields...])]). Save button should include @Set($showEdit, false) to close modal.
