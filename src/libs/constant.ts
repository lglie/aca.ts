export const Delimiter = `__` // Namespace seperator for database table names
export const ClientApiExport = ['$RPC', '$Enum', '$TB', '$TbOper']
export const ServerApiExport = [...ClientApiExport, '$ApiBridge']
export const FrameworkClient = ['vue', 'react', 'gatsby']
export const Pkg = `package.json`
export const AcaDir = `.aca`
export const AcaConfig = `${AcaDir}/config.json`
export const AcaConfigSchema = `${AcaDir}/config.schema.json`
export const AcaExample = `${AcaDir}/example-blog.ts`
export const AcaTsconfig = `${AcaDir}/tsconfig.json`
export const AcaMiscDir = `${AcaDir}/.misc`
export const AcaMiscRecordsDir = `${AcaMiscDir}/records`
export const AcaMiscRemark = `${AcaMiscDir}/remark.json`
export const AcaOrmPropetty = `${AcaMiscDir}/.orm.ts`

export const DefaultServerName = `server`
export const DefaultClientName = `client`
export const DefaultTsDir = `src`
export const DefaultServerApiDir = `aca.server`
export const DefaultClientApiDir = `aca.client`
export const ApiIndex = `index.ts`
export const ServerRPCDir = `rpc`
export const ServerRPCIndex = `${ServerRPCDir}/index.ts`
export const ServerPackage = `package.json`
export const ServerTsconfig = `tsconfig.json`
export const ServerServe = `.dev-serve.ts`
export const ServerIndex = `index.ts`
export const ClientApi = `aca.ts`
export const ClientApiIndex = `index.ts`

export const aggregates = [
  'count',
  'countDistinct',
  'sum',
  'sumDistinct',
  'avg',
  'avgDistinct',
  'max',
  'mix',
]

export const queries = [
  'findOne',
  'findFirst',
  'findMany',
  'insert',
  'upsert',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  '$',
]

export const argOpts = ['findFirst', 'findMany', 'deleteMany'].concat(
  aggregates
)
