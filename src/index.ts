#!/usr/bin/env node
import * as command from './cli'

declare var echo: any // 系统命令
// declare var ts-node: any // 系统命令

require('shelljs/global')
const yargs = require('yargs')

const comment = {
  create: 'init a new aca project [dirname]',
  server:
    'create a server [dirname] application, [dirname] default: server. --framework: koa, express, amazon, azure, google, ali, tencent, default: no server application',
  client:
    'create a client [dirname] application, [dirname] default: client. --framework: vue, react, gatsby',
  add:
    'create a application config. --server or --client: server app or client app, --apiDir [name] name: default src',
  up: 'generate api',
  rollback: 'rollback to previous release',
}
const usage = `
aca create [dirname]   ${comment.create}
aca server [dirname] --framework [name]  ${comment.server}
aca client [dirname] --framework [name]  ${comment.client}
aca add [dirname] <--server or --client> --apiDir [name]   ${comment.add}
aca up  ${comment.up}
aca rollback  ${comment.rollback}
`

if (yargs.argv._.length) {
  yargs
    .command('create', comment.create, command.create)
    .command('server', comment.server, command.server)
    .command('client', comment.client, command.client)
    .command('add', comment.add, command.addApp)
    .command('up', comment.up, command.up)
    .command('rollback', comment.rollback, command.up)
    .usage(usage)
    .help('h')
    .alias('h', 'help').argv
} else echo(usage)
