
module.exports = `\n

type $EnumKeys = keyof $Enum

type $Enumerable<T> = T | Array<T>

type $Order = 'asc' | 'desc'

type $WhereLogic = 'AND' | 'OR' | 'NOT'

const $FindQuery = {
  findOne: true,
  findFirst: true,
  findMany: true,
}

const $AggregateQuery = {
  count: true,
  countDistinct: true,
  sum: true,
  sumDistinct: true,
  avg: true,
  avgDistinct: true,
  max: true,
  mix: true,
}

const $MutationQuery = {
  insert: true,
  upsert: true,
  update: true,
  updateMany: true,
  delete: true,
  deleteMany: true,
}

type $FindQuery = keyof typeof $FindQuery
type $AggregateQuery = keyof typeof $AggregateQuery
type $MutationQuery = keyof typeof $MutationQuery


export type $ApiBridge =
  | {
      kind: 'rpc'
      method: string[]
      args: any
    }
  | {
      kind: 'orm'
      query: string
      dbVar: string
      method: string[]
      args: any
    }
  | {
      kind: 'raw'
      dbVar: string
      args: any
    }

type $StringFilter<TNull = true> = {
  eq?: TNull extends true ? string | null : string
  in?: TNull extends true ? Array<string> | null : Array<string>
  not?: TNull extends true
    ? $StringFilter<TNull> | string | null
    : $StringFilter<TNull> | string
  contains?: string
  startsWith?: string
  endsWith?: string
  like?: string
  between?: Array<string>
  lt?: string
  lte?: string
  gt?: string
  gte?: string
  AND?: $Enumerable<$StringFilter<TNull>>
  OR?: $Enumerable<$StringFilter<TNull>>
}

type $EnumFilter<T, TNull = true> = {
  eq?: TNull extends true ? T | null : T
  in?: TNull extends true ? Array<T> | null : Array<T>
  not?: TNull extends true
    ? $EnumFilter<T, TNull> | T | null
    : $EnumFilter<T, TNull> | T
  contains?: string
  startsWith?: string
  endsWith?: string
  like?: string
  between?: Array<string>
  lt?: string
  lte?: string
  gt?: string
  gte?: string
  AND?: $Enumerable<$EnumFilter<T, TNull>>
  OR?: $Enumerable<$EnumFilter<T, TNull>>
}

type $NumberFilter<TNull = true> = {
  eq?: TNull extends true ? number | null : number
  in?: TNull extends true ? Array<number> | null : Array<number>
  not?: TNull extends true
    ? $NumberFilter<TNull> | number | null
    : $NumberFilter<TNull> | number
  lt?: number
  lte?: number
  gt?: number
  gte?: number
  like?: number
  between?: Array<number>
  AND?: $Enumerable<$NumberFilter<TNull>>
  OR?: $Enumerable<$NumberFilter<TNull>>
}

type $DateFilter<TNull = true> = {
  eq?: TNull extends true ? Date | string | null : Date | string
  in?: TNull extends true ? Array<Date|string> | null : Array<Date|string>
  not?: TNull extends true
    ? $DateFilter<TNull> | Date| string | null
    : $DateFilter<TNull> | Date| string
  lt?: Date | string
  lte?: Date | string
  gt?: Date | string
  gte?: Date | string
  like?: Date | string
  between?: Array<Date | string>
  AND?: $Enumerable<$DateFilter<TNull>>
  OR?: $Enumerable<$DateFilter<TNull>>
}
type $BooleanFilter<TNull = true> = {
  eq?: TNull extends true ? boolean | null : boolean
  not?: TNull extends true
    ? $BooleanFilter<TNull> | boolean | null
    : $BooleanFilter<TNull> | boolean
  AND?: $Enumerable<$BooleanFilter<TNull>>
  OR?: $Enumerable<$BooleanFilter<TNull>>
}

type $ObjectFilter<TNull = true> = {
  eq?: TNull extends true ? string | null : string
  not?: TNull extends true ? Array<string> | null : Array<string>
  AND?: $Enumerable<$ObjectFilter<TNull>>
  OR?: $Enumerable<$ObjectFilter<TNull>>
}
`