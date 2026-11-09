# Tables

Table(columns: Col[]) — Data table — column-oriented. Each Col holds its own data array.
Col(label: string, data: any, type?: "string" | "number" | "action") — Column definition — holds label + data array
EditableTable(name?: string, columns?: {type: "text" | "number" | "date-single" | "select" | "url", key?: string, header?: string, width?: number, options?: {value: string, label: string}[]}[], data?: {id: string, values: (string | number)[]}[]) — Spreadsheet-like table whose cells the user can edit inline (text, number, url, date, select columns); edits are saved back as a form field
- EditableTable lets the user edit cells inline. Give it a unique name, columns of { type, key, header } with type one of text | number | date-single | select | url (select also needs options: [{ value, label }]).
- data is an array of { id, values } rows where values are ordered positionally to match columns. Edited data is submitted when the user clicks Save Changes.
- Table is COLUMN-oriented: Table([Col("Label", dataArray), Col("Count", countArray, "number")]). Use array pluck for data: items.fieldName
- Col data can be component arrays for styled cells: Col("Status", @Each(items, "item", Tag(item.status, null, "sm", item.status == "open" ? "success" : "danger")))
- Row actions: Col("Actions", @Each(items, "t", Button("Edit", Action([@Set($showEdit, true), @Set($editId, t.id)]))))
- Sortable: sorted = @Sort(items, $sortField, "desc"). Bind $sortField to Select. Use sorted.fieldName for Col data
- Searchable: filtered = @Filter(items, "title", "contains", $search). Bind $search to Input
- Chain sort + filter: filtered = @Filter(...) then sorted = @Sort(filtered, ...) — use sorted for both Table and Charts
- Empty state: @Count(items) > 0 ? Table([...]) : TextContent("No data yet")
