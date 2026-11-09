# Tables

Table(columns: Col[]) — Data table — column-oriented. Each Col holds its own data array.
Col(label: string, data: any, type?: "string" | "number" | "action") — Column definition — holds label + data array
EditableTable(name?: string, columns?: {type: "text" | "number" | "date-single" | "select" | "url", key?: string, header?: string, width?: number, options?: {value: string, label: string}[]}[], data?: {id: string, values: (string | number)[]}[]) — Spreadsheet-like table whose cells the user can edit inline (text, number, url, date, select columns); edits are saved back as a form field
- EditableTable lets the user edit cells inline. Give it a unique name, columns of { type, key, header } with type one of text | number | date-single | select | url (select also needs options: [{ value, label }]).
- data is an array of { id, values } rows where values are ordered positionally to match columns. Edited data is submitted when the user clicks Save Changes.
