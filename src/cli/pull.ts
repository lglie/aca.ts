
import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { currentDir } from '../libs/common'
import SqlDiff from '../libs/sql-diff'

// 从数据库读取表结构的接口
interface TableSchema {
  name: string
  columns: {
    name: string
    type: string
    isNullable: boolean
    defaultValue: any
    isPrimaryKey: boolean
    isAutoIncrement: boolean
  }[]
  foreignKeys: {
    column: string
    referencedTable: string
    referencedColumn: string
  }[]
  indexes: {
    name: string
    columns: string[]
    isUnique: boolean
  }[]
}

// 根据数据库类型返回获取所有表的 SQL
function getAllTablesSql(driver: string): string {
  switch (driver) {
    case 'pg':
      return `SELECT tablename FROM pg_tables
              WHERE tablename NOT LIKE 'pg_%'
              AND tablename NOT LIKE 'sql_%'
              AND tablename != '___ACA'
              ORDER BY tablename`
    case 'mysql2':
    case 'mysql':
      return `SHOW TABLES`
    case 'mssql':
      return `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_TYPE = 'BASE TABLE'
              AND TABLE_NAME != '___ACA'
              ORDER BY TABLE_NAME`
    case 'sqlite3':
      return `SELECT name FROM sqlite_master
              WHERE type='table'
              AND name != '___ACA'
              ORDER BY name`
    default:
      throw new Error(`Unsupported driver: ${driver}`)
  }
}

// 根据数据库类型返回获取表结构的 SQL
function getTableSchemaSql(driver: string, tableName: string): string {
  switch (driver) {
    case 'pg':
      return `SELECT 
                column_name, 
                data_type, 
                is_nullable, 
                column_default,
                (SELECT COUNT(*) FROM information_schema.constraint_column_usage 
                 WHERE table_name = '${tableName}' 
                 AND column_name = c.column_name 
                 AND constraint_name IN (SELECT constraint_name FROM information_schema.table_constraints 
                                        WHERE table_name = '${tableName}' 
                                        AND constraint_type = 'PRIMARY KEY')) as is_primary_key
              FROM information_schema.columns c
              WHERE table_name = '${tableName}'
              ORDER BY ordinal_position`
    case 'mysql2':
    case 'mysql':
      return `DESCRIBE ${tableName}`
    case 'mssql':
      return `SELECT 
                COLUMN_NAME, 
                DATA_TYPE, 
                IS_NULLABLE, 
                COLUMN_DEFAULT,
                (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                 WHERE TABLE_NAME = '${tableName}' 
                 AND COLUMN_NAME = c.COLUMN_NAME 
                 AND CONSTRAINT_NAME IN (SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
                                        WHERE TABLE_NAME = '${tableName}' 
                                        AND CONSTRAINT_TYPE = 'PRIMARY KEY')) as is_primary_key
              FROM INFORMATION_SCHEMA.COLUMNS c
              WHERE TABLE_NAME = '${tableName}'
              ORDER BY ORDINAL_POSITION`
    case 'sqlite3':
      return `PRAGMA table_info(${tableName})`
    default:
      throw new Error(`Unsupported driver: ${driver}`)
  }
}

// 根据数据库类型返回获取外键的 SQL
function getForeignKeysSql(driver: string, tableName: string): string {
  switch (driver) {
    case 'pg':
      return `SELECT 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name, 
                ccu.column_name AS foreign_column_name
              FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
                JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
              WHERE 
                constraint_type = 'FOREIGN KEY' 
                AND tc.table_name = '${tableName}'`
    case 'mysql2':
    case 'mysql':
      return `SHOW CREATE TABLE ${tableName}`
    case 'mssql':
      return `SELECT 
                kcu.COLUMN_NAME, 
                ccu.TABLE_NAME AS foreign_table_name, 
                ccu.COLUMN_NAME AS foreign_column_name
              FROM 
                INFORMATION_SCHEMA.TABLE_CONSTRAINTS AS tc 
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS kcu ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE AS ccu ON ccu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
              WHERE 
                constraint_type = 'FOREIGN KEY' 
                AND tc.TABLE_NAME = '${tableName}'`
    case 'sqlite3':
      return `PRAGMA foreign_key_list(${tableName})`
    default:
      throw new Error(`Unsupported driver: ${driver}`)
  }
}

// 从数据库类型映射到 TypeScript 类型
function mapDbTypeToTsType(dbType: string, driver: Driver): string {
  const lowerType = dbType.toLowerCase()
  const sqlDiff = SqlDiff(driver)
  
  // 检查是否为整数类型
  if (sqlDiff.keyword.dbTypes.int.includes(lowerType)) {
    return 'int'
  }
  
  // 检查是否为浮点数类型
  if (sqlDiff.keyword.dbTypes.float.includes(lowerType)) {
    return 'float'
  }
  
  // 检查是否为布尔类型
  if (sqlDiff.keyword.dbTypes.boolean.includes(lowerType)) {
    return 'boolean'
  }
  
  // 检查是否为日期类型
  if (sqlDiff.keyword.dbTypes.Date.includes(lowerType)) {
    return 'Date'
  }
  
  // 检查是否为对象类型
  if (sqlDiff.keyword.dbTypes.object.includes(lowerType)) {
    return 'object'
  }
  
  // 默认为字符串类型
  return 'string'
}

// 生成 ORM 文件内容
function generateOrmContent(schema: TableSchema[], dbName: string, driver: Driver): string {
  let content = `namespace ${dbName} {\n\n`
  
  // 生成每个表的类定义
  for (const table of schema) {
    content += `  export class ${table.name} {\n`
    
    // 生成列定义
    for (const column of table.columns) {
      const tsType = column.isPrimaryKey ? 'id' : mapDbTypeToTsType(column.type, driver)
      const isOptional = column.isNullable || column.isAutoIncrement
      const optionalMark = isOptional ? '?' : ''
      const defaultValue = column.defaultValue !== null ? ` = ${column.defaultValue}` : ''
      
      content += `    ${column.name}${optionalMark}: ${tsType}${defaultValue}\n`
    }
    
    // 生成关系定义（简化处理，只处理一对多关系）
    for (const fk of table.foreignKeys) {
      // 添加一对一关系
      content += `    ${fk.referencedTable}: ${fk.referencedTable}\n`
    }
    
    // 查找引用当前表的外键，添加一对多关系
    for (const otherTable of schema) {
      if (otherTable.name !== table.name) {
        const referencingFks = otherTable.foreignKeys.filter(fk => fk.referencedTable === table.name)
        if (referencingFks.length > 0) {
          content += `    ${otherTable.name}s: ${otherTable.name}[]\n`
        }
      }
    }
    
    content += `  }\n\n`
  }
  
  content += `}`
  return content
}

// 从 PostgreSQL 数据库读取表结构
async function getPgSchema(db: any): Promise<TableSchema[]> {
  const tablesResult = await db.query(getAllTablesSql('pg'))
  const tables = tablesResult.rows.map((row: any) => row.tablename)
  
  const schema: TableSchema[] = []
  
  for (const table of tables) {
    // 获取表结构
    const columnsResult = await db.query(getTableSchemaSql('pg', table))
    const columns = columnsResult.rows.map((row: any) => ({
      name: row.column_name,
      type: row.data_type,
      isNullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
      isPrimaryKey: row.is_primary_key > 0,
      isAutoIncrement: row.column_default?.includes('nextval')
    }))
    
    // 获取外键
    const fkResult = await db.query(getForeignKeysSql('pg', table))
    const foreignKeys = fkResult.rows.map((row: any) => ({
      column: row.column_name,
      referencedTable: row.foreign_table_name,
      referencedColumn: row.foreign_column_name
    }))
    
    schema.push({
      name: table,
      columns,
      foreignKeys,
      indexes: [] // 简化处理，暂不支持索引
    })
  }
  
  return schema
}

// 从 SQLite 数据库读取表结构
async function getSqliteSchema(db: any): Promise<TableSchema[]> {
  return new Promise((resolve, reject) => {
    db.all(getAllTablesSql('sqlite3'), (err: Error, tables: any[]) => {
      if (err) reject(err)
      
      const schema: TableSchema[] = []
      let processed = 0
      
      if (tables.length === 0) {
        resolve(schema)
        return
      }
      
      tables.forEach((table: any) => {
        const tableName = table.name
        
        // 获取表结构
        db.all(getTableSchemaSql('sqlite3', tableName), (err: Error, columns: any[]) => {
          if (err) reject(err)
          
          const processedColumns = columns.map((col: any) => ({
            name: col.name,
            type: col.type,
            isNullable: col.notnull === 0,
            defaultValue: col.dflt_value,
            isPrimaryKey: col.pk > 0,
            isAutoIncrement: col.pk > 0 && col.type.toLowerCase() === 'integer'
          }))
          
          // 获取外键
          db.all(getForeignKeysSql('sqlite3', tableName), (err: Error, fks: any[]) => {
            if (err) reject(err)
            
            const foreignKeys = fks.map((fk: any) => ({
              column: fk.from,
              referencedTable: fk.table,
              referencedColumn: fk.to
            }))
            
            schema.push({
              name: tableName,
              columns: processedColumns,
              foreignKeys,
              indexes: [] // 简化处理，暂不支持索引
            })
            
            processed++
            if (processed === tables.length) {
              resolve(schema)
            }
          })
        })
      })
    })
  })
}

// 从 MySQL 数据库读取表结构
async function getMysqlSchema(db: any): Promise<TableSchema[]> {
  const [tablesResult] = await db.query(getAllTablesSql('mysql2'))
  const tables = Object.values((tablesResult as any)[0])
  
  const schema: TableSchema[] = []
  
  for (const table of tables) {
    const tableName = String(table)
    // 获取表结构
    const [columnsResult] = await db.query(getTableSchemaSql('mysql2', tableName))
    const columns = (columnsResult as any).map((row: any) => ({
      name: row.Field,
      type: row.Type,
      isNullable: row.Null === 'YES',
      defaultValue: row.Default,
      isPrimaryKey: row.Key === 'PRI',
      isAutoIncrement: row.Extra?.includes('auto_increment')
    }))
    
    // 获取外键（通过 SHOW CREATE TABLE 解析）
    const [createTableResult] = await db.query(getForeignKeysSql('mysql2', tableName))
    const createTableSql = (createTableResult as any)[0]['Create Table']
    const foreignKeys: any[] = []
    
    // 简单解析 CREATE TABLE SQL 以获取外键信息
    const fkRegex = /FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s*([^\s]+)\s*\(([^)]+)\)/g
    let match
    while ((match = fkRegex.exec(createTableSql)) !== null) {
      const columns = match[1].split(',').map((col: string) => col.trim())
      const referencedTable = match[2].replace(/`/g, '')
      const referencedColumns = match[3].split(',').map((col: string) => col.trim().replace(/`/g, ''))
      
      columns.forEach((column: string, index: number) => {
        foreignKeys.push({
          column: column.replace(/`/g, ''),
          referencedTable,
          referencedColumn: referencedColumns[index]
        })
      })
    }
    
    schema.push({
      name: tableName,
      columns,
      foreignKeys,
      indexes: [] // 简化处理，暂不支持索引
    })
  }
  
  return schema
}

// 主函数：从数据库拉取结构并生成 ORM 文件
export async function pull(yargs: any) {
  const currDir = currentDir()
  if (!currDir) {
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  }
  
  const acaDir = currDir === '.' ? '.' : '..'
  const acaRoot = path.resolve(acaDir)
  const config: Config = require(path.join(acaRoot, Cst.AcaConfig))
  
  if (!config.databases) {
    throw new Error('No database config found in config.ts')
  }
  
  // 遍历所有数据库配置
  for (const dbKey in config.databases) {
    const dbConfig = config.databases[dbKey]
    const driver = dbConfig.connectOption.driver
    const sqlDiff = SqlDiff(driver)
    
    // 获取连接配置
    const connConf = 
      process.env[dbConfig.connectOption.envConnect || ''] || 
      dbConfig.connectOption.connect
    
    console.log(`\nPulling schema from database: ${dbKey} (${driver})`)
    
    let db: any
    let schema: TableSchema[]
    
    try {
      // 连接数据库
      db = await sqlDiff.keyword.stmt.connect(acaDir, config, connConf)
      
      // 根据数据库类型读取表结构
      switch (driver) {
        case 'pg':
          schema = await getPgSchema(db)
          break
        case 'sqlite3':
          schema = await getSqliteSchema(db)
          break
        case 'mysql2':
          schema = await getMysqlSchema(db)
          break
        default:
          throw new Error(`Driver ${driver} is not supported for pull command yet`)
      }
      
      // 生成 ORM 文件内容
      const ormContent = generateOrmContent(schema, dbKey, driver)
      
      // 写入 ORM 文件
      const ormPath = path.join(acaRoot, Cst.AcaDir, dbKey)
      if (!fs.existsSync(ormPath)) {
        fs.mkdirSync(ormPath, { recursive: true })
      }
      
      const ormFile = path.join(ormPath, `${dbKey}.ts`)
      fs.writeFileSync(ormFile, ormContent, 'utf-8')
      
      console.log(`✓ Generated ORM file: ${ormFile}`)
      
      // 更新 config.json 中的 orm 字段
      const configPath = path.join(acaRoot, Cst.AcaConfig)
      const configJson = require(configPath)
      
      if (!configJson.orm) {
        configJson.orm = []
      }
      
      if (!configJson.orm.includes(dbKey)) {
        configJson.orm.push(dbKey)
        fs.writeFileSync(configPath, JSON.stringify(configJson, null, 2), 'utf-8')
        console.log(`✓ Updated config.json: added ${dbKey} to orm array`)
      }
      
    } catch (error) {
      console.error(`✗ Error pulling schema from ${dbKey}:`, error)
    } finally {
      // 关闭数据库连接
      if (db) {
        if (db.end) {
          await db.end()
        } else if (db.close) {
          await db.close()
        }
      }
    }
  }
  
  console.log('\nPull completed!')
}
