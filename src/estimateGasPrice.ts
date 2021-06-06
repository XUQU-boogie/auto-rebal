import { Provider } from '@ethersproject/abstract-provider'
import { BigNumber, BigNumberish } from '@ethersproject/bignumber'
import { formatUnits } from '@ethersproject/units'
import fetch from 'node-fetch'
export async function estimateGasPrice(provider: Provider): Promise<BigNumberish | void> {
  try {
    const network = await provider.getNetwork()
    if (network.name === 'homestead') {
      try {
        const response = await fetch('https://www.gasnow.org/api/v3/gas/price')
        if (response.ok) {
          const { data } = await response.json()
          console.log(`gas price estimate for ${network.name}: ${formatUnits(data.fast, 'gwei')}`)
          return data.fast
        }
      } catch (error) {
        console.error(`gasnow api call failed`, error)
      }
    }
    const block = await provider.getBlockWithTransactions('latest')
    const block1 = await provider.getBlockWithTransactions(-1)
    const block2 = await provider.getBlockWithTransactions(-2)
    const transactions = [...block.transactions, ...block1.transactions, ...block2.transactions]
    const filteredTxList = transactions.filter((tx) => tx.gasPrice.gt(0)) // filter out miner stuff
    const gasPrices = filteredTxList.map((tx) => tx.gasPrice)
    const gasSum = gasPrices.reduce((acc, cur) => acc.add(cur), BigNumber.from(0))
    const divisor = gasPrices.length || 1
    const average = gasSum.div(divisor).mul(102).div(100) // 2% gas price buffer over average rate
    console.log(`gas price estimate for ${network.name}: ${formatUnits(average, 'gwei')}`)
    return average || BigNumber.from(1)
  } catch (error) {
    console.error(`failed gas estimation: ${error}`)
    return BigNumber.from(1)
  }
}
