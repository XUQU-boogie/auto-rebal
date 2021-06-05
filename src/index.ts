import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { Token, WETH9 } from '@uniswap/sdk-core'
import { abi as IUniswapV3PoolStateABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/pool/IUniswapV3PoolState.sol/IUniswapV3PoolState.json'
import { abi as NonfungiblePositionManagerABI } from '@uniswap/v3-periphery/artifacts/contracts/interfaces/INonfungiblePositionManager.sol/INonfungiblePositionManager.json'
import { computePoolAddress, FeeAmount, Pool } from '@uniswap/v3-sdk'
import { config } from 'dotenv'
import { NonfungiblePositionManager, UniswapV3Pool } from './types/v3'
import { IUniswapV3PoolStateInterface } from './types/v3/IUniswapV3PoolState'

config({})

enum CHAIN_ID {
  KOVAN = 42,
}

const UNISWAP_ADDRESSES: Record<CHAIN_ID, Record<string, string>> = {
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

const DAI_ADDRESSES: Record<CHAIN_ID, string> = {
  [CHAIN_ID.KOVAN]: '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',
}

const chainId = (parseInt(process.env.chainId as unknown as string) || CHAIN_ID.KOVAN) as CHAIN_ID
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

const POOL_STATE_INTERFACE = new Interface(IUniswapV3PoolStateABI) as IUniswapV3PoolStateInterface
const tokenA = WETH9[chainId]
const tokenB = DAI
const [token0, token1] = tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]

async function main() {
  const poolAddress = computePoolAddress({
    factoryAddress: UNISWAP_ADDRESSES[chainId].coreFactory,
    tokenA: token0,
    tokenB: token1,
    fee: FeeAmount.MEDIUM,
  })
  const PoolContract = new Contract(poolAddress, POOL_STATE_INTERFACE, wallet) as UniswapV3Pool

  const slot0 = await PoolContract.slot0()
  const liquidity = await PoolContract.liquidity()
  const pool = new Pool(
    token0,
    token1,
    FeeAmount.MEDIUM,
    slot0.sqrtPriceX96.toString(),
    liquidity.toString(),
    slot0.tick
  )

  const NonfungiblePositionManagerAddress = UNISWAP_ADDRESSES[chainId].NonfungiblePositionManager
  const NonfungiblePositionManagerContract = new Contract(
    NonfungiblePositionManagerAddress,
    NonfungiblePositionManagerABI,
    wallet
  ) as NonfungiblePositionManager
  
  async function getActivePositionsForPair(positions: Position[]) {
    const addresses = [WETH9[chainId].address, DAI.address]
    const relevantPositions = positions.filter(
      (position) => addresses.includes(position.token0) && addresses.includes(position.token1)
    )
    return relevantPositions.filter(async (position) => {
      try {
        const below = pool && typeof position.tickLower === 'number' ? pool.tickCurrent < position.tickLower : undefined
        const above =
          pool && typeof position.tickUpper === 'number' ? pool.tickCurrent >= position.tickUpper : undefined
        const inRange: boolean = typeof below === 'boolean' && typeof above === 'boolean' ? !below && !above : false
        console.log('above, below, inRange', above, below, inRange)
      } catch (e) {
        console.error(e)
      }
    })
  }
  async function swapToFiftyFifty() {}
  async function withdrawLiquidity() {
    try {
    } catch (e) {
      console.error(e)
    }
  }
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
  const activePairPositions = await getActivePositionsForPair(positions)
  if (activePairPositions.length === 0) {
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
  .then(() => console.log('done'))
  .catch(async (e) => {
    console.log('=======================')
    console.error('error: process exited')
    console.error(e)
  })
