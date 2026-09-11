import type { FilterNode } from './d1-compat/filter';

/** 날짜 형식이 다르거나 같은 시각의 메시지가 있어도 id를 보조 커서로 사용한다. */
export function messageCursorFilter(createdAt: string, id: string, direction: 'lt' | 'gt'): FilterNode {
  return { kind: 'or', children: [
    { kind: 'cond', field: 'created_at', op: direction, value: createdAt },
    { kind: 'and', children: [
      { kind: 'cond', field: 'created_at', op: 'eq', value: createdAt },
      { kind: 'cond', field: 'id', op: direction, value: id },
    ] },
  ] };
}
