import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir } from '../libs/common'
import orm from '../orm'

// 命令格式：aca add [dirname] -s(-c)
export async function addApp(yargs: any) {
  const workDir = currentDir()
  if (!workDir)
    throw new Error(
      `当前目录不是aca项目目录，请转到项目目录或项目下的应用程序目录下运行该命令`
    )
  const acaDir = workDir === Cst.AcaDir ? '.' : '..'
  const argv = yargs.argv
  const server = Cst.DefaultServerName,
    client = Cst.DefaultClientName
  const argvS = argv.server || argv.s ? server : ''
  const argvC = argv.client || argv.c ? client : ''
  if (!argvS && !argvC) throw new Error(`命令缺少参数：--server 或者：--client`)
  let appName: string = argv._[1]

  if (workDir === Cst.AcaDir) {
    if (!appName)
      throw new Error(`没有指定appName，请使用：aca add [appName] <-s -c>`)
    if (!fs.existsSync(appName) || !fs.statSync(appName).isDirectory())
      throw new Error(`该项目下不存在文件夹名为: ${appName} 的应用程序`)
  } else {
    // 是在当前应用程序目录下创建其他应用程序配置的命令
    if (appName) {
      // 判断该应用程序是否存在
      const namePath = path.join(acaDir, appName)
      if (!fs.existsSync(namePath) || !fs.statSync(namePath).isDirectory())
        throw new Error(`不存在名为：${appName} 的应用程序`)
    } else appName = workDir
  }

  const dbs = Object.keys((await orm(acaDir)).dbs)
  let expArr, DefaultApiDir

  if (argvS && argvC) {
    expArr = dbs.concat(Cst.ServerApiExport)
    DefaultApiDir = path.join(Cst.DefaultTsDir, Cst.DefaultServerApiDir)
    addAppConfig(acaDir, appName, 'server', expArr, DefaultApiDir)
    expArr = dbs.concat(Cst.ClientApiExport)
    DefaultApiDir = path.join(Cst.DefaultTsDir, Cst.DefaultClientApiDir)
    addAppConfig(acaDir, appName, 'client', expArr, DefaultApiDir)
  } else {
    const kind = argvS || argvC
    expArr = dbs.concat(
      { server: Cst.ServerApiExport, client: Cst.ClientApiExport }[kind]
    )
    DefaultApiDir = path.join(
      Cst.DefaultTsDir,
      { server: Cst.DefaultServerApiDir, client: Cst.DefaultClientApiDir }[kind]
    )
    const apiDir = argv.a || argv.apiDir || DefaultApiDir
    addAppConfig(acaDir, appName, <any>kind, expArr, apiDir)
  }

  console.log(
    `该应用的配置已被写入到： ${Cst.AcaConfig}文件中，打开如下连接进行配置：
${path.join(path.resolve(acaDir), Cst.AcaConfig)}
`
  )
}
