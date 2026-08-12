// ============================================================
// lib/d1-compat/where-builder.ts
// SELECT·UPDATE·DELETE 빌더가 공유하는 where 체인 메서드.
// ============================================================
//
// 세 빌더(QueryBuilder·UpdateBuilder·DeleteBuilder)가 eq/neq/lt/gt/lte/gte/
// is/not/in 아홉 개를 각각 똑같이 구현하고 있었다. 연산자를 하나 추가하거나
// `not` 의 매핑 규칙을 손볼 때 세 곳을 같이 고쳐야 하는 구조라, 어느 하나를
// 빠뜨리면 "UPDATE 에서만 되는 연산자" 같은 형태로 조용히 갈라진다.
//
// 상태(state)의 모양은 빌더마다 다르므로 조건 배열만 추상 접근자로 받는다.
import type { WhereCondition } from './types';

export abstract class WhereClauseBuilder {
  /** 각 빌더의 state.where 를 그대로 돌려준다 (같은 배열 참조여야 한다). */
  protected abstract get whereConditions(): WhereCondition[];

  private push(field: string, op: WhereCondition['op'], value: unknown): this {
    this.whereConditions.push({ field, op, value });
    return this;
  }

  eq(field: string, value: unknown): this {
    return this.push(field, 'eq', value);
  }
  neq(field: string, value: unknown): this {
    return this.push(field, 'neq', value);
  }
  lt(field: string, value: unknown): this {
    return this.push(field, 'lt', value);
  }
  gt(field: string, value: unknown): this {
    return this.push(field, 'gt', value);
  }
  lte(field: string, value: unknown): this {
    return this.push(field, 'lte', value);
  }
  gte(field: string, value: unknown): this {
    return this.push(field, 'gte', value);
  }
  is(field: string, value: unknown): this {
    return this.push(field, 'is', value);
  }
  /** `.not('col', 'is', null)` → isNot, `.not('col', 'eq', v)` → neq */
  not(field: string, op: 'is' | 'eq', value: unknown): this {
    return this.push(field, op === 'is' ? 'isNot' : 'neq', value);
  }
  in(field: string, values: unknown[]): this {
    return this.push(field, 'in', values);
  }
}
