export const faas = (fnName: string) => `
// 本文件为本地开发测试使用，生产环境不需要此文件
import Koa from 'koa'
import bodyParser from 'koa-body'
import cors from 'koa-cors'
import { ${fnName} } from '.'

export const app = new Koa()
app.use(cors())
app.use(bodyParser())
app.use(async (ctx, next) => {
  console.log('request: ', ctx.request.body)
  const res = await ${fnName}(ctx.request.body, ctx)
  console.log('response: ', res)
  ctx.body = res
})

app.listen({ port: 8080 }, () =>
  console.log('Server ready at http://localhost:8080')
)
`
