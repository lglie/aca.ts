export const faasProvider = (provider: string, consts: string) => {
  const params: {
    name: string
    param: string
    loop: string
    api: string
  } = {
    ali: {
      name: 'handle',
      param: 'event, context',
      loop: '',
      api: 'JSON.parse(event.body)',
    },
    amazon: {
      name: 'handle',
      param: 'event, context',
      loop: '',
      api: 'JSON.parse(event.body)',
    },
    azure: {
      name: 'handle',
      param: 'event, context',
      loop: '',
      api: 'JSON.parse(event.body)',
    },
    google: {
      name: 'handle',
      param: 'event, context',
      loop: '',
      api: 'JSON.parse(event.body)',
    },
    tencent: {
      name: 'handle',
      param: 'event, context',
      loop: 'context.callbackWaitsForEmptyEventLoop = false',
      api: 'JSON.parse(event.body)',
    },
  }[provider]

  return `import { ${consts} } from './aca.api'

export const ${params.name} = async (${params.param}) => {
    ${params.loop}
    const acaReq = await $ApiBridge(context, ${params.api})

  return acaReq
}
`
}
