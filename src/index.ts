import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { parseUnits } from '@ethersproject/units'
import { JsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { Currency, CurrencyAmount, Price, Token, WETH9 } from '@uniswap/sdk-core'
import { abi as NonfungiblePositionManagerABI } from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json'
import { FeeAmount, Pool } from '@uniswap/v3-sdk'
import { config } from 'dotenv'
import { NonfungiblePositionManager } from './types/v3'
import JSBI from 'jsbi'

config({})

enum CHAIN_ID {
  KOVAN = 42,
  GOERLI = 5,
}

const UNISWAP_ADDRESSES = {
  [CHAIN_ID.KOVAN]: {
    coreFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    weth9: '0xd0A1E359811322d97991E03f863a0C30C2cF029C',
    multicall: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
    proxyAdmin: '0xB753548F6E010e7e680BA186F9Ca1BdAB2E90cf2',
    tickLens: '0xbfd8137f7d1516D3ea5cA83523914859ec47F573',
    quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    NFTDescriptor: '0x42B24A95702b9986e82d421cC3568932790A48Ec',
    NonFungiblePositionDescriptor: '0x91ae842A5Ffd8d12023116943e72A606179294f3',
    TransparentUpgradeableProxy: '0xEe6A57eC80ea46401049E92587E52f5Ec1c24785',
    NonfungiblePositionManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  },
}

const DAI_ADDRESSES = {
  [CHAIN_ID.KOVAN]: '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',
}

const chainId = parseInt(process.env.chainId as unknown as string) || CHAIN_ID.KOVAN
console.log(process.env.rpc, chainId)
const provider = new JsonRpcProvider(process.env.rpc, chainId)
const wallet = new Wallet(process.env.privateKey, provider)
const account = wallet.address
const DAI = new Token(chainId, DAI_ADDRESSES[chainId], 18, 'DAI', 'DAI')
const WETH = WETH9[chainId]

interface Position {
  nonce: BigNumber
  operator: string
  token0: string
  token1: string
  fee: number
  tickLower: number
  tickUpper: number
  liquidity: BigNumber
  feeGrowthInside0LastX128: BigNumber
  feeGrowthInside1LastX128: BigNumber
  tokensOwed0: BigNumber
  tokensOwed1: BigNumber
}
function getActivePositionForPair(positions: Position[]) {
  const addresses = [WETH9[chainId].address, DAI.address]
  const relevantPositions = positions.filter(
    (position) => addresses.includes(position.token0) && addresses.includes(position.token1)
  )
  // todo: get pool data and use it to check against the positions' ranges
  const activePositions = relevantPositions.filter((position) => {
    const below = pool && typeof tickLower === 'number' ? pool.tickCurrent < tickLower : undefined
    const above = pool && typeof tickUpper === 'number' ? pool.tickCurrent >= tickUpper : undefined
    const inRange: boolean = typeof below === 'boolean' && typeof above === 'boolean' ? !below && !above : false
  })
  return activePositions
}
function swapToFiftyFifty() {}

async function main() {
  const poolAddress = Pool.getAddress(DAI, WETH, FeeAmount.MEDIUM)
  const NonfungiblePositionManagerAddress = UNISWAP_ADDRESSES[chainId].NonfungiblePositionManager
  const NonfungiblePositionManagerContract = new Contract(
    NonfungiblePositionManagerAddress,
    NonfungiblePositionManagerABI,
    wallet
  ) as NonfungiblePositionManager
  const positionCount = await NonfungiblePositionManagerContract.balanceOf(account)
  const positionIdRequests = []
  for (let i = 0; i < positionCount.toNumber(); i++) {
    positionIdRequests.push(NonfungiblePositionManagerContract.tokenOfOwnerByIndex(account, i))
  }
  const positionIds: BigNumber[] = await Promise.all(positionIdRequests)

  const positionRequests = []
  positionIds.forEach((positionId) => {
    positionRequests.push(NonfungiblePositionManagerContract.positions(positionId))
  })
  const positions = await Promise.all(positionRequests as Promise<Position>[])
  const activePairPosition = getActivePositionForPair(positions)
  if (activePairPosition.length === 0) {
    //   ensure gas prices are median of gasnow fast and standard, less than 100
    //   withdraw liquidity
    //   swap to 50/50 USD value
    //   create new position at +/- 7% range
    //     todo: reuse old positions if they're close to the target ticks
    // const mintParams = {
    //   amount0Desired: 1,
    //   amount1Desired: 1,
    //   amount0Min: 1,
    //   amount1Min: 1,
    //   deadline: Date.now() + 1000 * 60 * 60,
    //   fee: FeeAmount.MEDIUM,
    //   recipient: '',
    //   tickLower: 1,
    //   tickUpper: 2,
    //   token0: '',
    //   token1: '',
    // }
    // const mintOverrides = {
    //   gasPrice: 1,
    //   value: 1,
    // }
    // NonfungiblePositionManagerContract.mint(mintParams, mintOverrides)
  }
}

main()
  .then(() => process.exit(1))
  .catch(async (e) => {
    console.log('=======================')
    console.error('error: process exited')
    console.error(e)
  })
