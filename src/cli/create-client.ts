import fs from 'fs'
import path from 'path'
import * as Cst from '../libs/constant'
import { addAppConfig, currentDir } from '../libs/common'
import { reactPage } from '../libs/template'
import { execSync } from 'child_process'
import orm from '../orm'

export async function client(yargs: any) {
  const workDir = currentDir()
  if (!workDir)
    throw new Error(
      `Current directory is not an aca project directory. Please move to the project directory or the app directory under the project to run the command`
    )
  const acaDir = workDir === Cst.AcaDir ? '.' : '..'
  const argv = yargs.argv
  const rlvAcaDir = path.resolve(acaDir)
  let name = argv._[1] || Cst.DefaultClientName
  if (fs.existsSync(path.join(rlvAcaDir, name)))
    throw new Error(`The app '${name}' already exists and cannot be created`)
  let command = `npx create-react-app ${name} --template typescript`
  // let framework = ''
  // const frameworks = {
  //   vue: 'vue',
  //   v: 'vue',
  //   react: 'react',
  //   r: 'react',
  //   gatsby: 'gatsby',
  //   g: 'gatsby',
  // }

  // Object.keys(frameworks).some((v) => {
  //   if (argv[v]) {
  //     framework = frameworks[v]
  //     if (typeof argv[v] === 'string') name = argv[v]
  //     return true
  //   } else return false
  // })

  // if (!framework) throw new Error(`缺少参数missing parameters：--vue, --react, --gatsby`)
  // switch (framework) {
  //   case 'vue':
  //     return console.log(`Creating vue projects is not supported yet目前还不支持创建vue项目`)
  //   case 'react':
  //     command = `npx create-react-app ${name} --template typescript`
  //     break
  //   case 'gatsby':
  //     return console.log(`Creating gatsby projects is not supported yet目前还不支持创建gatsby项目`)
  // }

  console.log(`Creating app '${name}' using create-react-app, may take a few munites...`)
  execSync(`${acaDir === '..' ? 'cd .. & ' : ''}${command}`)
  const dbs = (await orm(acaDir)).dbs
  const expArr = Object.keys(dbs).concat(Cst.ClientApiExport)
  fs.writeFileSync(
    path.join(rlvAcaDir, name, Cst.DefaultTsDir, 'App.tsx'),
    reactPage(expArr.join(', '))
  )

  addAppConfig(
    acaDir,
    name,
    'client',
    expArr,
    path.join(Cst.DefaultTsDir, Cst.DefaultClientApiDir)
  )
}
