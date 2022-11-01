// Relationship agreement：
// one-to-one：primary key：optional：not array, foreign keys have props.foreign
// one-to-many：primary key：optional: array, foreign keys have props.foreign, type does not end with []
// many-to-many：optional: array, type ends with []
type AcaDir = '.' | '..'
type Config = {
  orm: string
  databases?: { default: DbConfig } & { [K: string]: DbConfig }
  serverApps: {
    kind: 'server'
  } & {
    [k: string]: {
      apiDir?: string
    }
  }
  clientApps: {
    kind: 'client'
  } & {
    [k: string]: {
      "~"?: string
      apiDir?: string
      allowRPCs?: string[]
      fetcher?: 'wx.request' | 'my.request' | 'tt.request' | 'uni.request' | 'Taro.request'  | 'fetch'
    }
  }
}

interface DbConfig {
  tableNameWithNamespace: boolean
  onlyApi: boolean
  connectOption: ConnectOption
  idDefaultType: Id
  foreignKeyConstraint?: boolean
  onUpdate: OnPrimaryMutation
  onDelete: OnPrimaryMutation
}

type Driver = 'pg' | 'mssql' | 'mysql2' | 'betterSqlite3'
type Id = 'autoincrement' | 'cuid' | 'uuid' | 'string' | 'int'

type RelConn = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

type SqliteConn = {
  filename: string
}

type ConnectOption = {
  envConnect: string
} & (
  | {
      driver: 'pg' | 'mssql' | 'mysql2'
      connect: RelConn
    }
  | {
      driver: 'betterSqlite3'
      connect: SqliteConn
    }
)

type OnPrimaryMutation = 'cascade' | 'set null' | 'restrict' | 'no action'

type ImportName = { [as: string]: string }

type Scalar =
  | 'boolean'
  | 'int'
  | 'float'
  | 'bigint'
  | 'string'
  | 'object'
  | 'Date'

type Optional = 'optional' | 'required' | 'array'

interface Diff {
  idDefaultType: Id
  quote: { start: string; end: string; value: string }
  idType: {
    [k in Id]: {
      jsType: string
      dbType: string
    }
  }
  scalarType: {
    [k in Scalar]: { jsType: string; dbType: string }
  }
  dbType: {
    enum: string
    cuid: string
    uuid: string
  }
  dbTypes: {
    boolean: string[]
    object: string[]
    float: string[]
    int: string[]
    autoincrement: string[]
    Date: [string, string, 'time ', string]
    string: string[]
  }
}

interface Ast {
  imports: Import[]
  vars: Var[]
  enums: Enums
  dbs: Dbs
}

type $db = string | DbConfig

interface Import {
  named: ImportName
  from: string
}
interface Initializer {
  type: string
  expression?: string
  initializer: any
}

interface Var {
  kind: 'const'
  names:
    | ({
        name: string
      } & Initializer)[]
    | { [k: string]: Initializer }
}

type Model = Namespace | Enum | View | Table

type Models = { [k: string]: Model }

interface DbVar {
  kind: 'namespace'
  name: string
  namespace: string[]
  models: Models & { kind: 'dbConfig'; $: $db }
}

type DbModels = { [k: string]: DbVar }

interface Namespace {
  kind: 'namespace'
  name: string
  namespace: string[]
  models: Models
}

interface Name {
  name: string
  map: string
  jsName: string
  dbName: string
}

type Enums = { [k: string]: Enum }

// Below is the difinition of ast
interface Enum {
  kind: 'enum'
  namespace: string[]
  name: string
  jsName: string
  values: string[]
}

type View = Name & {
  kind: `view`
  namespace: string[]
  props: ViewProp
  columns: {
    [k: string]: ViewColumn
  }
}

type ViewColumn = Name & {
  optional: Optional
  type: string
  column: string
}

interface ViewProp {
  distinct?: boolean
  select?: string
}

type Table = Name & {
  kind: 'table'
  extends?: string[]
  namespace: string[]
  id: string[]
  uniques: string[][]
  indexes: string[][]
  props: TableProp
  columns: Columns
}

interface AddColumn {
  name: string
  dbType: string
  notNull: boolean
}

type Column = Name & {
  optional: Optional
  type: string
  props: Props
}

type Columns = {
  [k: string]: Column
}

interface TableProp {
  id?: string[]
  uniques?: string[][]
  indexes?: string[][]
  deprecated?: string
}

interface Foreign {
  keys: string[]
  references: string[]
  onUpdate?: OnPrimaryMutation
  onDelete?: OnPrimaryMutation
}

interface Props {
  isId?: boolean
  idType?: string
  isArray?: boolean
  dbType: string
  jsType: string
  deprecated?: string
  unique?: boolean
  index?: boolean
  check?: string
  default?: any
  createdAt?: boolean
  updatedAt?: boolean
  foreign?: Foreign & {jsType?: string}
}

type TableView = Table | View

type TableItem = TableView | Tables

type FlatTables = { [k: string]: TableView }

type Tables = { [k: string]: TableItem }

type Db = { config: DbConfig; tables: Tables }
type Dbs = { [k: string]: Db }

interface NewOld {
  new: string
  old: string
}

interface DbAlter {
  [k: string]: {
    map?: NewOld
    props?: {
      add?: TableView[]
      remove?: TableView[]
    }
    columns?: {
      add?: Column[]
      remove?: Column[]
      alter?: {
        [k: string]: {
          map?: NewOld
          optional?: NewOld
          type?: NewOld
          props: {
            [k in keyof Props]: {
              new: any
              old: any
            }
          }
          relation?: any
        }
      }
    }
  }
}

interface DbMigrate {
  add?: TableView[]
  remove?: TableView[]
  alter?: DbAlter
}

// model annotations
interface Annotate {
  dbName?: string
  id?: string[]
  uniques?: (string | string[])[]
  foreignKeys?: string[]
  scalarColumns?: string[]
  updatedAtColumns?: string[]
  check?: string
  columns: Record<
    string,
    {
      name?: string
      dbName?: string
      type?: string
      jsType?: string
      dbType?: string
      optional?: Optional
      check?: string
      relation?: { relColumn: string } & (
        | {
            kind: 'primary'
            toOne?: boolean
            references: string[]
            keys: string[]
          }
        | { kind: 'foreign'; references: string[]; keys: string[] }
        | { kind: 'many'; mapTable: string }
      )
    }
  >
}

type Annotates = { [k: string]: Annotate }

interface Remark {
  date: string
  id: string
  comment: string
}
