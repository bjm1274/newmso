const TODO_LIST_COLUMNS = [
  'id',
  'user_id',
  'content',
  'is_complete',
  'task_date',
  'created_at',
  'priority',
  'reminder_at',
  'repeat_type',
  'assignee_kind',
  'repeat_parent_id',
  'repeat_generated_from_id',
  'source_message_id',
  'source_room_id',
];

export const TODO_OPTIONAL_COLUMNS = [
  'created_at',
  'priority',
  'reminder_at',
  'repeat_type',
  'assignee_kind',
  'repeat_parent_id',
  'repeat_generated_from_id',
  'source_message_id',
  'source_room_id',
];

export function buildTodoListSelect(omittedColumns: ReadonlySet<string> = new Set()) {
  return TODO_LIST_COLUMNS.filter((column) => !omittedColumns.has(column)).join(', ');
}

export const TODO_LIST_SELECT = buildTodoListSelect();
