import { useEffect, useState } from "react";
import { useStore } from "@nanostores/react";
import { formatUnits, parseUnits, zeroAddress } from "viem";
import { readContract } from "viem/actions";
import { writeContract } from "@wagmi/core";
import axios from "axios";

import {
  // useAccount,
  usePublicClient,
  // useNetwork,
  // useWalletClient,
  // useFeeData,
} from "wagmi";

import { VaultType } from "@components";

import {
  vaultData,
  assets,
  assetsPrices,
  assetsBalances,
  account,
  vaults,
  vaultAssets,
  platformData,
  tokens,
} from "@store";

import {
  VaultABI,
  StrategyABI,
  ERC20ABI,
  ZapABI,
  ERC20MetadataUpgradeableABI,
} from "@web3";
import {
  getTokenData,
  formatNumber,
  formatFromBigInt,
  calculateAPY,
  getTimeDifference,
  getStrategyInfo,
} from "@utils";

import type {
  TToken,
  TAddress,
  TVaultAllowance,
  TVaultInput,
  TVaultBalance,
  TTokenData,
  TPlatformData,
} from "@types";

import { TOKENS_ASSETS, CHAINS } from "@constants";

import tokensJson from "../../stability.tokenlist.json";

interface IProps {
  vault?: TAddress | undefined;
}

function Vault({ vault }: IProps) {
  const $vaultData = useStore(vaultData);
  const $assets: any = useStore(assets);
  const $account = useStore(account);
  const $vaults = useStore(vaults);
  const $assetsPrices: any = useStore(assetsPrices);
  const $assetsBalances = useStore(assetsBalances);
  const $vaultAssets: any = useStore(vaultAssets);
  const $platformData: TPlatformData | any = useStore(platformData);
  const $tokens: TAddress[] | any = useStore(tokens);

  const _publicClient = usePublicClient();

  const [tab, setTab] = useState("Deposit");
  const [option, setOption] = useState<string[] | any>([]);
  const [defaultOptionSymbols, setDefaultOptionSymbols] = useState("");
  const [defaultOptionAssets, setDefaultOptionAssets] = useState("");
  const [allowance, setAllowance] = useState<TVaultAllowance | undefined | any>(
    {}
  );
  const [isApprove, setIsApprove] = useState<number | undefined>();
  const [balances, setBalances] = useState<TVaultBalance | any>({});

  const [inputs, setInputs] = useState<TVaultInput | any>({});

  const [lastKeyPress, setLastKeyPress] = useState<{
    key1: string | undefined;
    key2: string | undefined;
  }>({ key1: undefined, key2: undefined });

  const [sharesOut, setSharesOut] = useState<bigint | any>();

  const [localVault, setLocalVault] = useState<any>();
  const [timeDifference, setTimeDifference] = useState<any>();
  const [strategyAddress, setStrategyAddress] = useState<
    TAddress | undefined
  >();
  const [strategyDescription, setStrategyDescription] = useState<
    string | undefined
  >();
  const [assetsAPR, setAssetsAPR] = useState<any>();
  const [withdrawAmount, setWithdrawAmount] = useState<string[] | any>(false);
  const [underlyingToken, setUnderlyingToken] = useState<any>();
  const [zapButton, setZapButton] = useState<string>("none");
  const [optionTokens, setOptionTokens] = useState<any>();

  const [currentChain, setCurrentChain] = useState<any>();

  const [tokenSelector, setTokenSelector] = useState<boolean>(false);
  const [activeOptionToken, setActiveOptionToken] = useState<any>({
    symbol: "",
    address: "",
  });
  const [defaultOptionImages, setDefaultOptionImages] = useState<any>();

  const checkButtonApproveDeposit = (apprDepo: number[]) => {
    if (apprDepo.length < 2) {
      return true;
    }
    return apprDepo.every(element => element === apprDepo[0]);
  };

  const checkInputsAllowance = (input: bigint[]) => {
    const apprDepo = [];
    let change = false;

    for (let i = 0; i < input.length; i++) {
      if (
        $assets &&
        $assetsBalances &&
        input[i] > $assetsBalances[$assets[i]].assetBalance &&
        lastKeyPress.key2 !== ""
      ) {
        setIsApprove(0);
        change = true;
      }
    }

    if (!change) {
      for (let i = 0; i < input.length; i++) {
        if (
          allowance &&
          $assets &&
          $assetsBalances &&
          input[i] <= $assetsBalances[$assets[i]].assetBalance &&
          allowance[$assets[i]]?.allowance[0] >= input[i]
        ) {
          apprDepo.push(1);
        } else {
          apprDepo.push(2);
        }
      }
      const button = checkButtonApproveDeposit(apprDepo);
      if (button) {
        setIsApprove(apprDepo[1]);
      } else {
        setIsApprove(2);
      }
    }
  };
  ///// INPUTS & OPTIONS
  const optionHandler = (
    option: any,
    symbol: string,
    address: string | TAddress,
    logoURI: string | string[]
  ) => {
    setTokenSelector(prevState => !prevState);

    ///// Option change
    resetInputs(option);
    setOption(option);
    ///// Active option
    setActiveOptionToken({
      symbol: symbol,
      address: address,
      logoURI: logoURI,
    });
  };

  const handleInputChange = (amount: string, asset: string) => {
    if (!amount) {
      resetInputs(option);
      return;
    }
    if (tab === "Deposit") {
      setInputs(
        (prevInputs: any) =>
          ({
            ...prevInputs,
            [asset]: {
              amount: amount,
            },
          } as TVaultInput)
      );

      if (option.length > 1) {
        setLastKeyPress({ key1: asset, key2: amount });
      }
    } else {
      const preview: TVaultInput | any = {};
      for (let i = 0; i < option.length; i++) {
        preview[option[i]] = {
          amount: amount as string,
        };
      }

      setInputs(preview);
    }
  };
  const resetOptions = () => {
    if ($assets) {
      const logos = defaultOptionAssets.split(", ").map(address => {
        const token = optionTokens.find(
          (token: any) => token.address === address
        );
        return token && token.logoURI;
      });

      setOption($assets);
      setActiveOptionToken({
        symbol: defaultOptionSymbols,
        address: defaultOptionAssets,
        logoURI: logos,
      });
    }
  };
  const resetInputs = (options: string[]) => {
    const reset: TVaultInput | any = {};

    for (let i = 0; i < options.length; i++) {
      reset[options[i]] = {
        amount: "",
      };
    }
    setInputs(reset);
    setIsApprove(undefined);
  };

  const defaultAssetsOption = (assets: string[]) => {
    const defaultOptionAssets: string[] = [];
    const logoURIs: string[] = [];
    for (let i = 0; i < assets.length; i++) {
      const token = getTokenData(assets[i]);

      if (token) {
        defaultOptionAssets[i] = token.symbol;
        logoURIs.push(token?.logoURI);
      } else {
        defaultOptionAssets[i] = "Token not found.";
      }
    }
    setDefaultOptionSymbols(defaultOptionAssets.join(" + "));
    setDefaultOptionAssets(assets.join(", "));
    setDefaultOptionImages(logoURIs);
  };

  /////

  /////   SELECT TOKENS
  const selectTokensHandler = async () => {
    if (!$tokens) return;
    const filtredTokens = tokensJson.tokens
      .filter(token => $tokens.includes(token.address))
      .map(({ address, symbol, logoURI }) => ({ address, symbol, logoURI }));

    ///// GET UNDERLYING TOKEN
    try {
      const strategy = await readContract(_publicClient, {
        address: vault as TAddress,
        abi: VaultABI,
        functionName: "strategy",
      });

      const underlying = await readContract(_publicClient, {
        address: strategy,
        abi: StrategyABI,
        functionName: "underlying",
      });
      if (underlying != zeroAddress) {
        const underlyingSymbol = await readContract(_publicClient, {
          address: underlying,
          abi: ERC20MetadataUpgradeableABI,
          functionName: "symbol",
        });

        const underlyingDecimals = await readContract(_publicClient, {
          address: underlying,
          abi: ERC20MetadataUpgradeableABI,
          functionName: "decimals",
        });

        const underlyingAllowance = await readContract(_publicClient, {
          address: underlying,
          abi: ERC20MetadataUpgradeableABI,
          functionName: "allowance",
          args: [$account as TAddress, vault as TAddress],
        });

        const underlyingBalance = await readContract(_publicClient, {
          address: underlying,
          abi: ERC20MetadataUpgradeableABI,
          functionName: "balanceOf",
          args: [$account as TAddress],
        });

        setUnderlyingToken({
          address: underlying,
          symbol: underlyingSymbol,
          decimals: underlyingDecimals,
          balance: formatUnits(underlyingBalance, underlyingDecimals),
          allowance: formatUnits(underlyingAllowance, underlyingDecimals),
          logoURI: "/protocols/Gamma.png",
        });

        setOptionTokens(filtredTokens);
      } else {
        setOptionTokens(filtredTokens);
      }
    } catch (error) {
      setOptionTokens(filtredTokens);
      console.log("UNDERLYING TOKEN ERROR:", error);
    }
  };
  /////
  /////         UNDERLYING
  const underlyingInputHandler = async (amount: string, asset: string) => {};
  const underlyingApprove = async () => {
    if (underlyingToken) {
    }
  };

  /////
  /////         ZAP
  const zapInputHandler = async (amount: string, asset: string) => {
    setInputs(
      (prevInputs: any) =>
        ({
          ...prevInputs,
          [asset]: {
            amount: amount,
          },
        } as TVaultInput)
    );
    if (!Number(amount)) {
      setZapButton("none");
      return;
    }

    if (Number(amount) > Number(balances[asset]?.assetBalance)) {
      setZapButton("insuficcientBalance");
      return;
    }
    try {
      const decimals = Number(getTokenData(option[0])?.decimals);

      const allowanceData = (await readContract(_publicClient, {
        address: option[0] as TAddress,
        abi: ERC20ABI,
        functionName: "allowance",
        args: [$account as TAddress, $platformData.zap as TAddress],
      })) as bigint;

      if (Number(formatUnits(allowanceData, decimals)) < Number(amount)) {
        setZapButton("needApprove");
      } else {
        getZapDepositSwapAmounts();
      }
    } catch (error) {
      console.log("ZAP ERROR:", error);
    }
  };
  const zapApprove = async () => {
    const amount = inputs[option[0]]?.amount;
    const decimals = getTokenData(option[0])?.decimals;

    if (amount && decimals) {
      try {
        const assetApprove = await writeContract({
          address: option[0],
          abi: ERC20ABI,
          functionName: "approve",
          args: [$platformData.zap as TAddress, parseUnits(amount, decimals)],
        });
      } catch (error) {
        console.log("APPROVE ERROR:", error);
      }
    }
  };
  const get1InchTokensSwap = async () => {
    const url = "https://api.1inch.dev/swap/v5.2/137/swap";

    const config = {
      headers: {
        Authorization: "secret_key",
      },
      params: {
        src: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        dst: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
        amount: "100000",
        from: "from_address",
        slippage: "1",
        disableEstimate: "true",
      },
    };

    try {
      const response = await axios.get(url, config);
    } catch (error) {
      console.log(error);
    }
  };
  const getZapDepositSwapAmounts = async () => {
    const amount = inputs[option[0]]?.amount;
    const decimals = Number(getTokenData(option[0])?.decimals);

    const zapAmounts = await readContract(_publicClient, {
      address: $platformData.zap,
      abi: ZapABI,
      functionName: "getDepositSwapAmounts",
      args: [vault as TAddress, option[0], parseUnits(amount, decimals)],
    });
    //await get1InchTokensSwap();
  };
  /////

  const approve = async (asset: TAddress) => {
    if (vault) {
      //const allowanceResult: TVaultAllowance = {};
      const maxUnits = parseUnits(
        inputs[asset].amount,
        getTokenData(asset)?.decimals as number
      );

      const assetApprove = await writeContract({
        address: asset,
        abi: ERC20ABI,
        functionName: "approve",
        args: [vault, maxUnits],
      });

      const transaction = await _publicClient.waitForTransactionReceipt(
        assetApprove
      );

      if (transaction.status === "success") {
        const newAllowance = (await readContract(_publicClient, {
          address: asset,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [$account as TAddress, vault],
        })) as bigint;

        setAllowance((prevAllowance: any) => ({
          ...prevAllowance,
          [asset]: {
            allowance: [newAllowance],
          },
        }));

        // const depositAssets = tokensJson.tokens
        //   .filter((token) => Object.keys(inputs).includes(token.address))
        //   .map(({ address, decimals }) =>
        //     parseUnits(inputs[address]?.amount, decimals)
        //   );

        // previewDeposit();
        // checkInputsAllowance(depositAssets);
      }
    }
  };

  const deposit = async () => {
    let assets: string[] = [];
    let input: any = [];

    for (let i = 0; i < option.length; i++) {
      assets.push(option[i]);

      const token: any = getTokenData(option[i]);

      input.push(parseUnits(inputs[option[i]].amount, token.decimals));
    }

    const depositAssets = await writeContract({
      address: vault as TAddress,
      abi: VaultABI,
      functionName: "depositAssets",
      args: [$assets as TAddress[], input, sharesOut, $account as TAddress],
    });
  };

  const withdraw = async () => {
    const value = parseUnits(inputs[option[0]]?.amount, 18);
    if (value) {
      const withdrawAssets = await writeContract({
        address: vault as TAddress,
        abi: VaultABI,
        functionName: "withdrawAssets",
        args: [$assets as TAddress[], value, [0n, 0n]],
      });
    }
  };

  const getStrategy = async () => {
    if (vault) {
      const strategy: TAddress | undefined = (await readContract(
        _publicClient,
        {
          address: vault,
          abi: VaultABI,
          functionName: "strategy",
        }
      )) as TAddress | undefined;

      if (typeof strategy === "string") {
        setStrategyAddress(strategy);
        const assetsData: string[] = (await readContract(_publicClient, {
          address: strategy,
          abi: StrategyABI,
          functionName: "assets",
        })) as string[];

        const description = await readContract(_publicClient, {
          address: strategy,
          abi: StrategyABI,
          functionName: "description",
        });
        if (description) {
          setStrategyDescription(description);
        }

        if (Array.isArray(assetsData)) {
          assets.set(assetsData);
          setOption(assetsData);
          defaultAssetsOption(assetsData);
        }
      }
    }
  };

  const loadAssetsBalances = () => {
    const balance: TVaultBalance | any = {};

    if ($assetsBalances && option.length > 1) {
      for (let i = 0; i < option.length; i++) {
        const decimals = getTokenData(option[i])?.decimals;
        if (decimals !== undefined) {
          balance[option[i]] = {
            assetBalance: formatUnits(
              $assetsBalances[option[i]].assetBalance,
              decimals
            ),
          };
        }
      }
    } else if ($assetsBalances?.[option[0]] && option.length === 1) {
      const decimals = getTokenData(option[0])?.decimals;
      if (decimals !== undefined) {
        balance[option[0]] = {
          assetBalance: formatUnits(
            $assetsBalances[option[0]].assetBalance,
            decimals
          ),
        };
      }
    } else if (underlyingToken && option.length === 1) {
    }
    setBalances(balance);
  };

  const previewWithdraw = async (value: string) => {
    const balance = Number(
      formatUnits($vaultData[vault as TAddress].vaultUserBalance, 18)
    );

    if (Number(value) > balance || !Number(value)) {
      setWithdrawAmount(false);
      return;
    }

    let preview: any = await readContract(_publicClient, {
      address: localVault.address as TAddress,
      abi: VaultABI,
      functionName: "previewWithdraw",
      args: [parseUnits(value, 18)],
    });
    preview = preview.map((amount: any, index: number) => {
      const tokenData: TTokenData | any = getTokenData($assets[index]);
      return {
        symbol: tokenData?.symbol,
        amount: formatUnits(amount, tokenData?.decimals),
      };
    });
    setWithdrawAmount(preview);
  };

  const checkAllowance = async () => {
    const allowanceResult: TVaultAllowance | any = {};

    for (let i = 0; i < option.length; i++) {
      const allowanceData = (await readContract(_publicClient, {
        address: option[i] as TAddress,
        abi: ERC20ABI,
        functionName: "allowance",
        args: [$account as TAddress, vault as TAddress],
      })) as bigint;

      if (!allowanceResult[option[i]]) {
        allowanceResult[option[i]] = { allowance: [] };
      }
      allowanceResult[option[i]].allowance.push(allowanceData);
    }
    setAllowance(allowanceResult);
  };
  const previewDeposit = async () => {
    //if (!Number(lastKeyPress.key2)) return;
    if ($assets && lastKeyPress.key1 && tab === "Deposit") {
      const changedInput = $assets?.indexOf(lastKeyPress.key1);
      const preview: TVaultInput | any = {};
      if (option) {
        let amounts: bigint[] = [];
        for (let i = 0; i < option.length; i++) {
          if (i === changedInput) {
            amounts.push(
              parseUnits(
                inputs[lastKeyPress.key1].amount,
                Number(getTokenData(lastKeyPress.key1)?.decimals)
              )
            );
          } else {
            amounts.push(parseUnits("1", 36));
          }
        }

        if (typeof vault === "string") {
          try {
            const previewDepositAssets: (bigint | bigint[] | any)[] =
              (await readContract(_publicClient, {
                address: vault as TAddress,
                abi: VaultABI,
                functionName: "previewDepositAssets",
                args: [$assets as TAddress[], amounts],
              })) as any;
            checkInputsAllowance(previewDepositAssets[0] as bigint[]);
            setSharesOut(
              ((previewDepositAssets[1] as bigint) * BigInt(1)) / BigInt(100)
            );

            const previewDepositAssetsArray: bigint[] = [
              ...previewDepositAssets[0],
            ];

            for (let i = 0; i < $assets.length; i++) {
              const decimals = getTokenData($assets[i])?.decimals;
              if (i !== changedInput && decimals) {
                preview[$assets[i]] = {
                  amount: formatUnits(previewDepositAssetsArray[i], decimals),
                };
              }
            }
            if (lastKeyPress.key2 !== "") {
              setInputs((prevInputs: any) => ({
                ...prevInputs,
                ...preview,
              }));
            }
          } catch (error) {
            console.error(
              "Error: the asset balance is too low to convert.",
              error
            );
            setIsApprove(undefined);
          }
        }
      }
    }
  };

  useEffect(() => {
    getStrategy();
  }, [vault]);

  useEffect(() => {
    checkAllowance();
    loadAssetsBalances();
  }, [option, $assetsBalances]);

  useEffect(() => {
    previewDeposit();
  }, [lastKeyPress]);

  useEffect(() => {
    if ($vaults?.length && $vaultData) {
      const vaultUserBalances = Object.values($vaultData).map(
        ({ vaultUserBalance }) => String(vaultUserBalance)
      );
      const vaults = $vaults[0].map((_: any, index: number) => {
        let assets;
        if ($vaultAssets.length) {
          const token1 = getTokenData($vaultAssets[index][1][0]);
          const token2 = getTokenData($vaultAssets[index][1][1]);

          assets = [
            {
              logo: token1?.logoURI,
              symbol: token1?.symbol,
              name: token1?.name,
            },
            {
              logo: token2?.logoURI,
              symbol: token2?.symbol,
              name: token2?.name,
            },
          ];
        }

        const tempAPR = Number(formatUnits($vaults[7][index], 3)).toFixed(4);
        const APY = calculateAPY(tempAPR).toFixed(4);

        return {
          address: $vaults[0][index],
          name: $vaults[1][index],
          symbol: $vaults[2][index],
          type: $vaults[3][index],
          assetsWithApr: $vaultAssets[index][3],
          assetsAprs: $vaultAssets[index][4],
          lastHardWork: $vaultAssets[index][5],
          shareprice: String($vaults[5][index]),
          tvl: String($vaults[6][index]),
          apr: tempAPR,
          strategyApr: Number(formatUnits($vaults[8][index], 3)).toFixed(4),
          strategySpecific: $vaults[9][index],
          apy: APY,
          balance: vaultUserBalances[index],
          daily: (Number(tempAPR) / 365).toFixed(4),
          assets: assets,
          strategyInfo: getStrategyInfo($vaults[2][index]),
        };
      });

      setLocalVault(
        vaults.filter((thisVault: any) => thisVault.address === vault)[0]
      );
    }
  }, [$vaults, $vaultData, $vaultAssets]);

  useEffect(() => {
    if (localVault) {
      const TD = getTimeDifference(localVault.lastHardWork);
      setTimeDifference(TD);

      setAssetsAPR(
        localVault.assetsAprs.map((apr: string) =>
          formatFromBigInt(apr, 16).toFixed(2)
        )
      );
    }
  }, [localVault]);

  useEffect(() => {
    setZapButton("none");
  }, [option]);

  useEffect(() => {
    selectTokensHandler();
  }, [$tokens, defaultOptionSymbols]);

  useEffect(() => {
    if (_publicClient) {
      setCurrentChain(
        CHAINS.find(item => item.name === _publicClient.chain.name)
      );
    }
  }, [_publicClient]);
  useEffect(() => {
    if (
      (!activeOptionToken.symbol || !activeOptionToken.address) &&
      optionTokens
    ) {
      const logos = defaultOptionAssets.split(", ").map(address => {
        const token = optionTokens.find(
          (token: any) => token.address === address
        );
        return token && token.logoURI;
      });

      setActiveOptionToken({
        symbol: defaultOptionSymbols,
        address: defaultOptionAssets,
        logoURI: logos,
      });
    }
  }, [defaultOptionAssets, defaultOptionSymbols, optionTokens]);

  return vault && $vaultData[vault] ? (
    <main className="w-full mx-auto">
      <div className="flex justify-between items-center p-4 bg-button rounded-md">
        {localVault && (
          <div className="flex flex-col w-full">
            <div className="flex items-center gap-4 w-full justify-between flex-wrap">
              <div className="flex  items-center">
                <img
                  className="w-8 h-8 rounded-full"
                  src={localVault?.assets[0].logo}
                  alt={localVault?.assets[0].symbol}
                  title={localVault?.assets[0].name}
                />
                <img
                  className="w-8 h-8 rounded-full ml-[-8px]"
                  src={localVault?.assets[1].logo}
                  alt={localVault?.assets[1].symbol}
                  title={localVault?.assets[1].name}
                />

                <span className="inline-flex ml-2 text-[18px] font-bold whitespace-nowrap">
                  {localVault.symbol}
                </span>
              </div>

              <div className="flex items-center">
                <span className="text-[18px] lg:text-[20px]">
                  {localVault.name}
                </span>
              </div>
              <div className="bg-[#485069] text-[#B4BFDF] px-2 py-1 rounded-md text-[15px] flex">
                CHAIN:
                <img
                  className="w-6 h-6 rounded-full mx-1"
                  src={currentChain?.logoURI}
                  alt={currentChain?.name}
                />
                {currentChain?.name}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-start gap-5 mt-6">
        <div className="w-2/3">
          {localVault && (
            <div className="flex justify-between items-center bg-button p-4 rounded-md h-[80px]">
              <VaultType type={localVault.type} />
              <div>
                <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                  TVL
                </p>
                <p>
                  {formatNumber(
                    formatFromBigInt(localVault.tvl, 18, "withFloor"),
                    "abbreviate"
                  )}
                </p>
              </div>
              <div>
                <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                  APY
                </p>
                <p>{localVault.apy}%</p>
              </div>
              <div>
                <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                  Daily
                </p>
                <p>{localVault.daily}%</p>
              </div>
              <div>
                <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                  SHARE PRICE
                </p>
                <p>
                  ${formatFromBigInt(localVault.shareprice, 18, "withDecimals")}
                </p>
              </div>
            </div>
          )}

          {localVault?.strategyInfo && (
            <div className="rounded-md mt-5 bg-button">
              <div className="bg-[#1c1c23] rounded-t-md flex justify-between items-center h-[60px]">
                <h2 className=" text-[24px] text-start ml-4">Strategy</h2>
                <div className="flex items-center gap-5 mr-3 ">
                  <button className="rounded-md bg-button flex justify-center items-center w-[140px]">
                    <a
                      className="flex items-center text-[15px] py-2 px-1"
                      href={`https://polygonscan.com/address/${strategyAddress}`}
                      target="_blank">
                      Strategy address
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="icon icon-tabler icon-tabler-external-link ms-1"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round">
                        <path
                          stroke="none"
                          d="M0 0h24v24H0z"
                          fill="none"></path>
                        <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path>
                        <path d="M11 13l9 -9"></path>
                        <path d="M15 4h5v5"></path>
                      </svg>
                    </a>
                  </button>
                  <button className="rounded-md bg-button flex justify-center items-center  w-[140px]">
                    <a
                      className="flex items-center text-[15px] py-2 px-1"
                      href={`https://polygonscan.com/token/${localVault.address}`}
                      target="_blank">
                      Vault address
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="icon icon-tabler icon-tabler-external-link ms-1"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round">
                        <path
                          stroke="none"
                          d="M0 0h24v24H0z"
                          fill="none"></path>
                        <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path>
                        <path d="M11 13l9 -9"></path>
                        <path d="M15 4h5v5"></path>
                      </svg>
                    </a>
                  </button>
                  <button className="rounded-md bg-button justify-center items-center w-[140px] hidden">
                    <a
                      className="flex items-center text-[15px] py-2 px-1"
                      href={localVault.strategyInfo.sourceCode}
                      target="_blank">
                      Github
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="icon icon-tabler icon-tabler-external-link ms-1"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round">
                        <path
                          stroke="none"
                          d="M0 0h24v24H0z"
                          fill="none"></path>
                        <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path>
                        <path d="M11 13l9 -9"></path>
                        <path d="M15 4h5v5"></path>
                      </svg>
                    </a>
                  </button>
                </div>
              </div>

              <div className={`flex flex-col items-start gap-3 p-4`}>
                <div className="flex">
                  <div className="flex py-1 pl-[8px] mr-3">
                    {localVault.strategyInfo.protocols.map(
                      ({
                        name,
                        logoSrc,
                      }: {
                        name: string;
                        logoSrc: string;
                      }) => (
                        <img
                          title={name}
                          key={name}
                          src={logoSrc}
                          alt={name}
                          className="h-8 w-8 rounded-full ml-[-8px]"
                        />
                      )
                    )}
                  </div>

                  <div
                    style={{
                      backgroundColor: localVault.strategyInfo.bgColor,
                      color: localVault.strategyInfo.color,
                    }}
                    className="px-3 rounded-[8px] flex items-center">
                    <p>
                      {localVault.strategyInfo.name}
                      {localVault.strategySpecific
                        ? " " + localVault.strategySpecific
                        : ""}
                    </p>
                  </div>

                  <div
                    className="flex items-center ml-3"
                    title="Farming strategy">
                    <svg
                      fill="#46e29b"
                      width="32px"
                      height="32px"
                      viewBox="0 0 96 96"
                      id="Layer_1_1_"
                      version="1.1"
                      xmlSpace="preserve"
                      xmlns="http://www.w3.org/2000/svg"
                      xmlnsXlink="http://www.w3.org/1999/xlink">
                      <rect
                        height="2"
                        width="2"
                        x="18"
                        y="84"
                      />
                      <rect
                        height="2"
                        width="2"
                        x="6"
                        y="82"
                      />
                      <rect
                        height="2"
                        width="2"
                        x="30"
                        y="79"
                      />
                      <rect
                        height="2"
                        width="2"
                        x="63"
                        y="79"
                      />
                      <rect
                        height="2"
                        width="2"
                        x="78"
                        y="81"
                      />
                      <rect
                        height="2"
                        width="2"
                        x="86"
                        y="85"
                      />
                      <path d="M94,91l-18.739-1.972l-2.707,1.805c-0.035,0.023-0.07,0.044-0.107,0.062l-2,1l-0.895-1.789l1.944-0.972l1.616-1.077L69,86  h-6.586l-3.707,3.707C58.52,89.895,58.265,90,58,90h-2v-2h1.586l3.073-3.073L57,82h-7v-8.025C67.209,73.445,81,59.338,81,42h0  c-17.338,0-31.445,13.791-31.975,31h-1.051C47.445,55.791,33.338,42,16,42h0c0,17.338,13.791,31.445,31,31.975V82h-8l-3.499,2.799  l2.053,1.369c0.145,0.097,0.262,0.229,0.34,0.385L38.618,88H42v2h-4c-0.379,0-0.725-0.214-0.895-0.553l-0.881-1.763L33.697,86H27  l-5.091,2.182L24.6,90.2l-1.2,1.6l-3.69-2.768L2,91l-0.03,3H94V91z M77.293,44.293l1.414,1.414l-25,25l-1.414-1.414L77.293,44.293z   M44.309,70.723l-23-22l1.383-1.445l23,22L44.309,70.723z" />
                      <path d="M33,11.899V19c0,0.315,0.148,0.611,0.4,0.8l7.6,5.7V48h2V25c0-0.315-0.148-0.611-0.4-0.8L35,18.5v-6.601  c2.282-0.463,4-2.48,4-4.899c0-2.761-2.239-5-5-5s-5,2.239-5,5C29,9.419,30.718,11.436,33,11.899z M34,6c0.552,0,1,0.448,1,1  c0,0.552-0.448,1-1,1s-1-0.448-1-1C33,6.448,33.448,6,34,6z" />
                      <path d="M56,24.535l5.555-3.703C61.833,20.646,62,20.334,62,20v-8.101c2.282-0.463,4-2.48,4-4.899c0-2.761-2.239-5-5-5s-5,2.239-5,5  c0,2.419,1.718,4.436,4,4.899v7.566l-5.555,3.703C54.167,23.354,54,23.666,54,24v24h2V24.535z M61,6c0.552,0,1,0.448,1,1  c0,0.552-0.448,1-1,1s-1-0.448-1-1C60,6.448,60.448,6,61,6z" />
                      <path d="M70,24.899V29h-8c-0.552,0-1,0.448-1,1v12h2V31h8c0.552,0,1-0.448,1-1v-5.101c2.282-0.463,4-2.48,4-4.899  c0-2.761-2.239-5-5-5s-5,2.239-5,5C66,22.419,67.718,24.436,70,24.899z M71,19c0.552,0,1,0.448,1,1c0,0.552-0.448,1-1,1  s-1-0.448-1-1C70,19.448,70.448,19,71,19z" />
                      <path d="M24,23.899V30c0,0.552,0.448,1,1,1h8v10h2V30c0-0.552-0.448-1-1-1h-8v-5.101c2.282-0.463,4-2.48,4-4.899  c0-2.761-2.239-5-5-5s-5,2.239-5,5C20,21.419,21.718,23.436,24,23.899z M25,18c0.552,0,1,0.448,1,1c0,0.552-0.448,1-1,1  s-1-0.448-1-1C24,18.448,24.448,18,25,18z" />
                      <path d="M47.5,20.899V51h2V20.899c2.282-0.463,4-2.48,4-4.899c0-2.761-2.239-5-5-5s-5,2.239-5,5  C43.5,18.419,45.218,20.436,47.5,20.899z M48.5,15c0.552,0,1,0.448,1,1c0,0.552-0.448,1-1,1s-1-0.448-1-1  C47.5,15.448,47.948,15,48.5,15z" />
                    </svg>
                  </div>
                </div>

                {strategyDescription && (
                  <div className="mt-2">
                    <p className="uppercase text-[13px] leading-3 text-[#8D8E96]">
                      DESCRIPTION
                    </p>
                    <p className="text-[16px] mt-1">{strategyDescription}</p>
                  </div>
                )}
                <div className="mt-2">
                  <p className="uppercase text-[13px] leading-3 text-[#8D8E96]">
                    Total APR / APY
                  </p>
                  <p>
                    {localVault.apr}% / {localVault.apy}%
                  </p>
                </div>
                <div className="mt-2">
                  <p className="uppercase text-[13px] leading-3 text-[#8D8E96]">
                    Strategy APR
                  </p>
                  <p>{localVault.strategyApr}%</p>
                </div>

                {assetsAPR?.length && (
                  <div>
                    <div className="flex items-center gap-3 flex-wrap mt-2">
                      {assetsAPR.map((apr: string, index: number) => {
                        return (
                          <p
                            key={apr}
                            className="text-[14px] px-2 py-1 rounded-lg border-[2px] bg-[#486556] text-[#B0DDB8] border-[#488B57]">
                            {localVault.assetsWithApr[index]} APR {apr}%
                          </p>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="hidden mt-2">
                  <div className="mr-5">
                    <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                      BASE STRATEGIES
                    </p>
                    <div className="flex items-center gap-3 flex-wrap mt-3">
                      {localVault.strategyInfo.baseStrategies.map(
                        (strategy: string) => (
                          <p
                            className="text-[14px] px-2 rounded-lg border-[2px] bg-[#486556] border-[#488B57]"
                            key={strategy}>
                            {strategy}
                          </p>
                        )
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                      AMM ADAPTER
                    </p>
                    <p className="flex h-9 text-[16px] items-end">
                      {localVault.strategyInfo.ammAdapter}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <article className="rounded-md p-3 mt-5 bg-button">
            <h2 className="mb-2 text-[24px] text-start h-[50px] flex items-center ml-1">
              Assets
            </h2>
            {$assets &&
              $assets.map((asset: TAddress) => {
                const assetData: TToken | any = getTokenData(asset);

                const tokenAssets = TOKENS_ASSETS.find(tokenAsset => {
                  return tokenAsset.addresses.includes(assetData?.address);
                });

                if (assetData && $assetsPrices) {
                  return (
                    <article
                      className="rounded-md p-3 mb-4 flex bg-[#32343f]"
                      key={asset}>
                      <div className="flex w-full flex-col gap-3">
                        <div className="flex w-full justify-between items-center ">
                          <div className="inline-flex items-center">
                            <img
                              className="rounded-full w-[30px] m-auto mr-2"
                              src={assetData.logoURI}
                            />
                            <span className="mr-5 font-bold text-[18px]">
                              {assetData.symbol}
                            </span>
                            <span className="text-[18px]">
                              {assetData.name}
                            </span>
                          </div>
                          <div className="flex gap-3">
                            {tokenAssets?.website && (
                              <div className="rounded-md bg-[#404353] flex justify-center p-1 h-8 text-[16px]">
                                <a
                                  className="flex items-center"
                                  href={tokenAssets?.website}
                                  target="_blank">
                                  Website
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="icon icon-tabler icon-tabler-external-link ms-1"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    strokeWidth="2"
                                    stroke="currentColor"
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round">
                                    <path
                                      stroke="none"
                                      d="M0 0h24v24H0z"
                                      fill="none"></path>
                                    <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path>
                                    <path d="M11 13l9 -9"></path>
                                    <path d="M15 4h5v5"></path>
                                  </svg>
                                </a>
                              </div>
                            )}
                            <div className="rounded-md bg-[#404353] flex justify-center p-1 h-8 text-[16px]">
                              <a
                                className="flex items-center"
                                href={`https://polygonscan.com/token/${asset}`}
                                target="_blank">
                                Contract
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="icon icon-tabler icon-tabler-external-link ms-1"
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  strokeWidth="2"
                                  stroke="currentColor"
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round">
                                  <path
                                    stroke="none"
                                    d="M0 0h24v24H0z"
                                    fill="none"></path>
                                  <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path>
                                  <path d="M11 13l9 -9"></path>
                                  <path d="M15 4h5v5"></path>
                                </svg>
                              </a>
                            </div>
                            {tokenAssets?.docs && (
                              <div className="rounded-md bg-[#404353] flex justify-center p-1 h-8 text-[16px]">
                                <a
                                  className="flex items-center"
                                  href={tokenAssets?.docs}
                                  target="_blank">
                                  Docs
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="icon icon-tabler icon-tabler-external-link ms-1"
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    strokeWidth="2"
                                    stroke="currentColor"
                                    fill="none"
                                    strokeLinecap="round"
                                    strokeLinejoin="round">
                                    <path
                                      stroke="none"
                                      d="M0 0h24v24H0z"
                                      fill="none"></path>
                                    <path d="M12 6h-6a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-6"></path>
                                    <path d="M11 13l9 -9"></path>
                                    <path d="M15 4h5v5"></path>
                                  </svg>
                                </a>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-start items-center text-[16px]">
                          <p>
                            Price: $
                            {formatUnits($assetsPrices[asset].tokenPrice, 18)}
                          </p>
                        </div>

                        <p className="text-[16px]">
                          {tokenAssets?.description}
                        </p>
                        {assetData?.tags && (
                          <div className="flex items-center gap-3 flex-wrap">
                            {assetData.tags.map((tag: string) => (
                              <p
                                className="text-[14px] px-2  rounded-lg border-[2px] bg-[#486556] border-[#488B57] uppercase"
                                key={tag}>
                                {tag}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                }
              })}
          </article>
        </div>
        <div className="w-1/3">
          {localVault && (
            <div className="flex justify-between items-center bg-button px-5 py-4 rounded-md h-[80px]">
              <div className="flex flex-col">
                <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                  Your Balance
                </p>
                <p className="text-[18px]">
                  $
                  {formatNumber(
                    formatFromBigInt(localVault.balance, 18),
                    "format"
                  )}
                </p>
              </div>
              <div className="flex flex-col">
                {timeDifference && (
                  <div className="flex flex-col justify-between">
                    <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                      Last Hard Work
                    </p>
                    {timeDifference?.days ? (
                      <>
                        {timeDifference?.days < 1000 ? (
                          <div className="flex text-[14px] bg-[#6F5648] text-[#F2C4A0] px-2 rounded-lg border-[2px] border-[#AE642E] text-center">
                            {timeDifference.days}
                            {timeDifference.days > 1 ? "days" : "day"}{" "}
                            {timeDifference.hours}h ago
                          </div>
                        ) : (
                          <div className="text-[14px] bg-[#6F5648] text-[#F2C4A0] px-2  rounded-lg border-[2px] border-[#AE642E] text-center">
                            None
                          </div>
                        )}
                      </>
                    ) : (
                      <div
                        className={`text-[14px] px-2 rounded-lg border-[2px] text-center  ${
                          timeDifference.hours > 4
                            ? "bg-[#485069] text-[#B4BFDF] border-[#6376AF]"
                            : "bg-[#486556] text-[#B0DDB8] border-[#488B57]"
                        }`}>
                        {timeDifference?.hours
                          ? `${timeDifference.hours}h ago`
                          : "<1h ago"}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 bg-button rounded-md">
            <div className="flex">
              <button
                className={`h-[60px] cursor-pointer text-[16px] w-full rounded-tl-md  bg-[#1c1c23] ${
                  tab === "Deposit" && "border-b-[2px] border-[#6376AF]"
                }`}
                onClick={() => {
                  setTab("Deposit");
                  resetInputs(option);
                  resetOptions();
                }}>
                Deposit
              </button>
              <button
                className={`h-[60px] cursor-pointer text-[16px] w-full rounded-tr-md  bg-[#1c1c23]  ${
                  tab === "Withdraw" && "border-b-[2px] border-[#6376AF]"
                }`}
                onClick={() => {
                  setTab("Withdraw");
                  resetOptions();
                  resetInputs(option);
                }}>
                Withdraw
              </button>
            </div>
            <form
              autoComplete="off"
              className="max-w-[400px] px-4 mb-10 pb-5">
              <div className="flex flex-col items-start mt-4">
                {optionTokens && (
                  <div className="relative select-none max-w-[250px] w-full">
                    <div
                      onClick={() => {
                        setTokenSelector(prevState => !prevState);
                      }}
                      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 bg-[#13141f] text-[20px] cursor-pointer">
                      <div className="flex items-center gap-2">
                        {activeOptionToken?.logoURI &&
                        Array.isArray(activeOptionToken?.logoURI) ? (
                          <div className="flex items-center">
                            {activeOptionToken?.logoURI.map((logo: string) => (
                              <img
                                key={Math.random()}
                                className="max-w-6 max-h-6 rounded-full"
                                src={logo}
                                alt="logo"
                              />
                            ))}
                          </div>
                        ) : (
                          activeOptionToken?.logoURI && (
                            <img
                              className="max-w-6 max-h-6 rounded-full"
                              src={activeOptionToken?.logoURI}
                              alt="logo"
                            />
                          )
                        )}
                        <p>{activeOptionToken?.symbol}</p>
                      </div>

                      <svg
                        width="15"
                        height="9"
                        viewBox="0 0 15 9"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className={`transition delay-[50ms] ${
                          tokenSelector ? "rotate-[180deg]" : "rotate-[0deg]"
                        }`}>
                        <path
                          d="M1 1L7.5 7.5L14 1"
                          stroke="white"
                        />
                      </svg>
                    </div>

                    <div
                      className={`bg-[#13141f] mt-1 rounded-md w-full z-10 ${
                        tokenSelector
                          ? "absolute transition delay-[50ms]"
                          : "hidden"
                      } `}>
                      <div
                        onClick={() => {
                          optionHandler(
                            defaultOptionAssets.split(", "),
                            defaultOptionSymbols,
                            defaultOptionAssets,
                            defaultOptionImages
                          );
                        }}
                        className="text-center cursor-pointer opacity-60 hover:opacity-100 flex items-center justify-start px-5 gap-3">
                        {defaultOptionImages?.length && (
                          <div className="flex items-center">
                            {defaultOptionImages.map((logo: string) => (
                              <img
                                key={Math.random()}
                                className="max-w-6 max-h-6 rounded-full"
                                src={logo}
                                alt="logo"
                              />
                            ))}
                          </div>
                        )}
                        <p> {defaultOptionSymbols}</p>
                      </div>
                      {underlyingToken && (
                        <div
                          onClick={() => {
                            optionHandler(
                              [underlyingToken?.address],
                              underlyingToken?.symbol,
                              underlyingToken?.address,
                              "/protocols/Gamma.png"
                            );
                          }}
                          className="text-center cursor-pointer opacity-60 hover:opacity-100 flex items-center justify-start px-5 gap-3">
                          {underlyingToken?.logoURI && (
                            <img
                              className="max-w-6 max-h-6 rounded-full"
                              src={underlyingToken.logoURI}
                              alt="logo"
                            />
                          )}
                          <p> {underlyingToken.symbol}</p>
                        </div>
                      )}
                      {optionTokens.map(
                        ({
                          address,
                          symbol,
                          logoURI,
                        }: {
                          address: TAddress;
                          symbol: string;
                          logoURI: string;
                        }) => {
                          return (
                            <div
                              className="text-center cursor-pointer opacity-60 hover:opacity-100 flex items-center justify-start px-5 gap-3"
                              key={address}
                              onClick={() => {
                                optionHandler(
                                  [address],
                                  symbol,
                                  address,
                                  logoURI
                                );
                              }}>
                              {logoURI && (
                                <img
                                  className="max-w-6 max-h-6 rounded-full"
                                  src={logoURI}
                                  alt="logo"
                                />
                              )}
                              <p> {symbol}</p>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>

              {tab === "Deposit" && (
                <>
                  {option?.length > 1 ? (
                    <div className="flex flex-col items-center justify-center gap-3 mt-2 max-w-[350px]">
                      {option.map((asset: any) => (
                        <div key={asset}>
                          <div className="text-[16px] text-[gray] flex items-center gap-1 ml-2">
                            <p>Balance:</p>

                            <p>
                              {balances &&
                                balances[asset] &&
                                parseFloat(
                                  balances[asset].assetBalance
                                ).toFixed(3)}
                            </p>
                          </div>
                          <div className="rounded-xl  relative max-h-[150px] border-[2px] border-[#6376AF] max-w-[350px]">
                            <div className="absolute end-5 bottom-4">
                              <div className="flex items-center">
                                <button
                                  className="rounded-md w-14 border border-gray-500 ring-gray-500 hover:ring-1 text-gray-500 text-lg"
                                  type="button"
                                  onClick={() =>
                                    balances[asset] &&
                                    handleInputChange(
                                      balances[asset].assetBalance,
                                      asset
                                    )
                                  }>
                                  MAX
                                </button>
                              </div>
                            </div>

                            <input
                              className="w-[58%] pl-[50px] py-3 flex items-center h-full  text-[25px] bg-transparent"
                              list="amount"
                              id={asset}
                              name="amount"
                              placeholder="0"
                              value={
                                inputs && inputs[asset] && inputs[asset].amount
                              }
                              onChange={e =>
                                handleInputChange(e.target.value, e.target.id)
                              }
                              type="text"
                              onKeyDown={evt =>
                                ["e", "E", "+", "-", " ", ","].includes(
                                  evt.key
                                ) && evt.preventDefault()
                              }
                            />

                            <div className="absolute top-[25%] left-[5%]  bg-[#4e46e521] rounded-xl ">
                              {tokensJson.tokens.map(token => {
                                if (token.address === asset) {
                                  return (
                                    <div
                                      className="flex items-center gap-2"
                                      key={token.address}>
                                      {/* <p className="my-auto">{token.symbol}</p> */}
                                      <img
                                        className="rounded-full w-[25px] h-[25px] "
                                        src={token.logoURI}
                                        alt={token.name}
                                      />
                                    </div>
                                  );
                                }
                              })}
                            </div>
                          </div>
                          {$assetsPrices[asset] &&
                            inputs[asset]?.amount > 0 && (
                              <div className="text-[16px] text-[gray] flex items-center gap-1 ml-2">
                                <p>
                                  $
                                  {(
                                    Number(
                                      formatUnits(
                                        $assetsPrices[asset].tokenPrice,
                                        18
                                      )
                                    ) * inputs[asset].amount
                                  ).toFixed(2)}
                                </p>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <div className="flex flex-col mt-[15px] text-[15px] w-full">
                        {balances[option[0]] && (
                          <div className="text-left text-[gray] ml-2">
                            Balance:{" "}
                            {parseFloat(
                              balances[option[0]].assetBalance
                            ).toFixed(3)}
                          </div>
                        )}

                        <div className="rounded-xl  relative max-h-[150px] border-[2px] border-[#6376AF] max-w-[350px]">
                          <div className="absolute top-[30%] left-[5%]">
                            {tokensJson.tokens.map(token => {
                              if (token.address === option[0]) {
                                return (
                                  <div
                                    className="flex items-center"
                                    key={token.address}>
                                    {/* <p>{token.symbol}</p> */}
                                    <img
                                      className="w-[25px] h-[25px] rounded-full"
                                      src={token.logoURI}
                                      alt={token.name}
                                    />
                                  </div>
                                );
                              }
                            })}
                          </div>
                          {balances && balances[option[0]] && (
                            <div>
                              <div className="absolute right-0 bottom-0 pt-[15px] pl-[15px] pr-3 pb-3">
                                <div className="flex items-center">
                                  <button
                                    onClick={() =>
                                      zapInputHandler(
                                        balances[option[0]].assetBalance,
                                        option[0]
                                      )
                                    }
                                    className="rounded-md w-14 border border-gray-500 ring-gray-500 hover:ring-1 text-gray-500 text-lg"
                                    type="button">
                                    MAX
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {option && (
                            <input
                              list="amount"
                              id={option[0]}
                              value={inputs[option[0]]?.amount}
                              name="amount"
                              type="text"
                              placeholder="0"
                              onChange={e =>
                                zapInputHandler(e.target.value, e.target.id)
                              }
                              onKeyDown={evt =>
                                ["e", "E", "+", "-", " ", ","].includes(
                                  evt.key
                                ) && evt.preventDefault()
                              }
                              className="w-[58%] pl-[50px] py-3 flex items-center h-full  text-[25px] bg-transparent"
                            />
                          )}
                        </div>
                        {$assetsPrices[option[0]] &&
                          inputs[option[0]]?.amount > 0 && (
                            <div className="text-[16px] text-[gray] flex items-center gap-1 ml-2">
                              <p>
                                $
                                {(
                                  Number(
                                    formatUnits(
                                      $assetsPrices[option[0]].tokenPrice,
                                      18
                                    )
                                  ) * inputs[option[0]]?.amount
                                ).toFixed(2)}{" "}
                              </p>
                            </div>
                          )}
                      </div>
                      {zapButton === "insuficcientBalance" ? (
                        <button
                          disabled
                          className="mt-2 w-full flex items-center justify-center bg-[#6F5648] text-[#F2C4A0] border-[#AE642E] py-3 rounded-md">
                          INSUFICCIENT BALANCE
                        </button>
                      ) : zapButton === "needApprove" ? (
                        <button
                          className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                          type="button"
                          onClick={zapApprove}>
                          Approve {getTokenData(option[0])?.symbol}
                        </button>
                      ) : (
                        <></>
                      )}
                    </div>
                  )}
                  {isApprove === 1 ? (
                    <button
                      className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                      type="button"
                      onClick={() => deposit()}>
                      Deposit
                    </button>
                  ) : isApprove === 2 ? (
                    <>
                      {option.map(
                        (asset: any) =>
                          allowance &&
                          formatUnits(
                            allowance[asset].allowance[0],
                            Number(getTokenData(asset)?.decimals)
                          ) < inputs[asset].amount && (
                            <button
                              className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                              key={asset}
                              type="button"
                              onClick={() => approve(asset as TAddress)}>
                              Approve {getTokenData(asset)?.symbol}
                            </button>
                          )
                      )}
                    </>
                  ) : (
                    isApprove === 0 && (
                      <button
                        disabled
                        className="mt-2 w-full flex items-center justify-center bg-[#6F5648] text-[#F2C4A0] border-[#AE642E] py-3 rounded-md">
                        INSUFICCIENT BALANCE
                      </button>
                    )
                  )}
                </>
              )}

              {tab === "Withdraw" && (
                <>
                  <div className="grid mt-[15px] text-[15px] w-full">
                    {balances && balances[option[0]] && (
                      <div className="text-left text-[gray] ml-2">
                        Balance:{" "}
                        {parseFloat(
                          formatUnits($vaultData[vault].vaultUserBalance, 18)
                        ).toFixed(3)}
                      </div>
                    )}
                    <div className="rounded-xl  relative max-h-[150px] border-[2px] border-[#6376AF] max-w-[350px]">
                      {balances && balances[option[0]] && (
                        <div className="absolute right-0 bottom-0 pt-[15px] pl-[15px] pb-3 pr-3">
                          <div className="flex items-center">
                            <button
                              onClick={() =>
                                handleInputChange(
                                  formatUnits(
                                    $vaultData[vault]?.vaultUserBalance,
                                    18
                                  ),
                                  option[0]
                                )
                              }
                              type="button"
                              className="rounded-md w-14 border border-gray-500 ring-gray-500 hover:ring-1 text-gray-500 text-lg">
                              MAX
                            </button>
                          </div>
                        </div>
                      )}

                      <input
                        list="amount"
                        id={option.join(", ")}
                        value={inputs[option[0]]?.amount}
                        name="amount"
                        placeholder="0"
                        onChange={e => {
                          handleInputChange(e.target.value, e.target.id);
                          previewWithdraw(e.target.value);
                        }}
                        onKeyDown={evt =>
                          ["e", "E", "+", "-", " ", ","].includes(evt.key) &&
                          evt.preventDefault()
                        }
                        pattern="^[0-9]*[.,]?[0-9]*$"
                        inputMode="decimal"
                        className="w-[58%] pl-[50px] py-3 flex items-center h-full  text-[25px] bg-transparent"
                      />

                      <div className="absolute top-[30%] left-[5%]">
                        {option.length === 1 ? (
                          <>
                            {tokensJson.tokens.map(token => {
                              if (token.address === option[0]) {
                                return (
                                  <div
                                    className="flex items-center"
                                    key={token.address}>
                                    {/* <p>{token.symbol}</p>  */}
                                    <img
                                      className="w-[25px] h-[25px] rounded-full"
                                      src={token.logoURI}
                                      alt={token.name}
                                    />
                                  </div>
                                );
                              }
                            })}
                          </>
                        ) : (
                          <div className="flex h-[45px]">
                            <div className="items-center mr-[5px]">
                              {/* <p>
                                {symbols &&
                                  vault &&
                                  symbols[vault] &&
                                  symbols[vault]?.symbol}
                              </p> */}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {$assetsPrices[option[0]] &&
                      inputs[option[0]]?.amount > 0 && (
                        <div className="text-[16px] text-[gray] flex items-center gap-1 ml-2">
                          <p>
                            $
                            {(
                              Number(
                                formatUnits(
                                  $assetsPrices[option[0]].tokenPrice,
                                  18
                                )
                              ) * inputs[option[0]]?.amount
                            ).toFixed(2)}
                          </p>
                        </div>
                      )}
                  </div>
                  {withdrawAmount ? (
                    <div>
                      <div className="my-2 ml-2 flex flex-col gap-2">
                        {withdrawAmount?.map(
                          ({
                            symbol,
                            amount,
                          }: {
                            symbol: string;
                            amount: string;
                          }) => (
                            <div key={symbol}>
                              <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                                {symbol}
                              </p>
                              <p>{amount}</p>
                            </div>
                          )
                        )}
                      </div>
                      <button
                        type="button"
                        className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                        onClick={() => withdraw()}>
                        WITHDRAW
                      </button>
                    </div>
                  ) : (
                    Number(inputs[option[0]]?.amount) >
                      Number(
                        formatUnits($vaultData[vault]?.vaultUserBalance, 18)
                      ) && (
                      <button
                        disabled
                        className="mt-2 w-full flex items-center justify-center bg-[#6F5648] text-[#F2C4A0] border-[#AE642E] py-3 rounded-md">
                        INSUFICCIENT BALANCE
                      </button>
                    )
                  )}
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </main>
  ) : (
    <h1>Loading Vault..</h1>
  );
}
export { Vault };
