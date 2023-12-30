import { useState, useEffect, useCallback, useRef } from "react";
import { useStore } from "@nanostores/react";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { formatUnits, parseUnits, zeroAddress, maxUint256 } from "viem";
import { readContract } from "viem/actions";
import { writeContract } from "@wagmi/core";

import { usePublicClient } from "wagmi";

import { SettingsModal } from "./SettingsModal";
import { VaultType, Loader, AssetsProportion } from "@components";

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
  lastTx,
  connected,
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
  getTimeDifference,
  get1InchRoutes,
  debounce,
} from "@utils";

import { TOKENS_ASSETS, CHAINS } from "@constants";

import type {
  TToken,
  TAddress,
  TVaultAllowance,
  TVaultInput,
  TVaultBalance,
  TTokenData,
  TPlatformData,
} from "@types";

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
  const $connected = useStore(connected);
  const _publicClient = usePublicClient();

  const { open } = useWeb3Modal();

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
  const [withdrawAmount, setWithdrawAmount] = useState<string[] | any>(false);
  const [zapPreviewWithdraw, setZapPreviewWithdraw] = useState<any>();
  const [underlyingToken, setUnderlyingToken] = useState<any>();
  const [underlyingShares, setUnderlyingShares] = useState<any>();
  const [zapShares, setZapShares] = useState<any>();
  const [zapButton, setZapButton] = useState<string>("none");
  const [optionTokens, setOptionTokens] = useState<any>();

  const [currentChain, setCurrentChain] = useState<any>();

  const [tokenSelector, setTokenSelector] = useState<boolean>(false);
  const [activeOptionToken, setActiveOptionToken] = useState<any>({
    symbol: "",
    address: "",
    logoURI: "",
  });
  const [defaultOptionImages, setDefaultOptionImages] = useState<any>();
  const [settingsModal, setSettingsModal] = useState(false);
  const [slippage, setSlippage] = useState("1");
  const [zapTokens, setZapTokens] = useState<any>(false);
  const [zapError, setZapError] = useState<boolean>(false);
  const [rotation, setRotation] = useState<number>(0);
  const [isRefresh, setIsRefresh] = useState(false);
  const [loader, setLoader] = useState<boolean>(false);

  const tokenSelectorRef = useRef<HTMLDivElement>(null);

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
          (token: any) => token.address.toLowerCase() === address
        );
        return token?.logoURI;
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
      const token = getTokenData(assets[i].toLowerCase());
      if (token) {
        defaultOptionAssets[i] = token.symbol;
        logoURIs.push(token.logoURI);
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
      .filter(token => $tokens.includes(token.address.toLowerCase()))
      .map(({ address, symbol, logoURI }) => ({ address, symbol, logoURI }));

    ///// GET UNDERLYING TOKEN

    try {
      if (localVault.underlying != zeroAddress) {
        if ($connected) {
          const underlyingSymbol = await readContract(_publicClient, {
            address: localVault.underlying,
            abi: ERC20MetadataUpgradeableABI,
            functionName: "symbol",
          });

          const underlyingDecimals = await readContract(_publicClient, {
            address: localVault.underlying,
            abi: ERC20MetadataUpgradeableABI,
            functionName: "decimals",
          });

          const underlyingAllowance = await readContract(_publicClient, {
            address: localVault.underlying,
            abi: ERC20MetadataUpgradeableABI,
            functionName: "allowance",
            args: [$account as TAddress, vault as TAddress],
          });

          const underlyingBalance = await readContract(_publicClient, {
            address: localVault.underlying,
            abi: ERC20MetadataUpgradeableABI,
            functionName: "balanceOf",
            args: [$account as TAddress],
          });
          setUnderlyingToken({
            address: localVault.underlying,
            symbol: underlyingSymbol,
            decimals: underlyingDecimals,
            balance: formatUnits(underlyingBalance, underlyingDecimals),
            allowance: formatUnits(underlyingAllowance, underlyingDecimals),
            logoURI: "/protocols/Gamma.png",
          });
        } else {
          const defaultTokens = defaultOptionSymbols.split(" + ");
          setUnderlyingToken({
            address: localVault.underlying,
            symbol: `aw${defaultTokens[0]}-${defaultTokens[1]}`,
            decimals: 18,
            balance: 0,
            allowance: 0,
            logoURI: "/protocols/Gamma.png",
          });
        }
      }
      setOptionTokens(filtredTokens);
    } catch (error) {
      setOptionTokens(filtredTokens);
      console.error("UNDERLYING TOKEN ERROR:", error);
    }
  };
  /////
  /////         ZAP
  const getZapAllowance = async (asset = option[0]) => {
    let allowanceData;
    if (tab === "Deposit") {
      if (asset === underlyingToken?.address) {
        allowanceData = await readContract(_publicClient, {
          address: asset as TAddress,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [$account as TAddress, vault as TAddress],
        });
      } else {
        allowanceData = await readContract(_publicClient, {
          address: asset as TAddress,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [$account as TAddress, $platformData.zap as TAddress],
        });
      }
    } else {
      allowanceData = await readContract(_publicClient, {
        address: vault as TAddress,
        abi: ERC20ABI,
        functionName: "allowance",
        args: [$account as TAddress, $platformData.zap as TAddress],
      });
    }

    return allowanceData;
  };

  const debouncedZap = useCallback(
    debounce(async (amount: string, asset: string) => {
      if (!Number(amount)) {
        setZapButton("none");
        setZapTokens(false);
        return;
      }

      if (
        tab === "Deposit" &&
        Number(amount) > Number(balances[asset]?.assetBalance)
      ) {
        setZapButton("insufficientBalance");
      }

      if (
        tab === "Withdraw" &&
        Number(amount) >
          parseFloat(
            formatUnits($vaultData[vault as TAddress].vaultUserBalance, 18)
          )
      ) {
        setZapButton("insufficientBalance");
        setZapTokens(false);
        return;
      }

      if (asset === underlyingToken?.address) {
        try {
          const previewDepositAssets = await readContract(_publicClient, {
            address: vault as TAddress,
            abi: VaultABI,
            functionName: "previewDepositAssets",
            args: [[asset as TAddress], [parseUnits(amount, 18)]],
          });

          setUnderlyingShares(formatUnits(previewDepositAssets[1], 18));

          const allowanceData = (await readContract(_publicClient, {
            address: option[0] as TAddress,
            abi: ERC20ABI,
            functionName: "allowance",
            args: [$account as TAddress, vault as TAddress],
          })) as bigint;

          if (
            Number(formatUnits(allowanceData, 18)) < Number(amount) &&
            Number(amount) <= Number(balances[asset]?.assetBalance)
          ) {
            setZapButton("needApprove");
          }

          if (
            Number(amount) <= Number(balances[asset]?.assetBalance) &&
            Number(formatUnits(allowanceData, 18)) >= Number(amount)
          ) {
            setZapButton(tab.toLowerCase());
          }

          checkInputsAllowance(previewDepositAssets[0] as bigint[]);
          setSharesOut(
            ((previewDepositAssets[1] as bigint) * BigInt(1)) / BigInt(100)
          );
        } catch (error) {
          console.error("UNDERLYING SHARES ERROR:", error);
        }
      } else {
        ///// DEPOSIT / WITHDRAW
        try {
          const decimals = Number(getTokenData(asset)?.decimals);

          const allowanceData = await getZapAllowance(asset);

          if (tab === "Withdraw") {
            if (Number(formatUnits(allowanceData, decimals)) < Number(amount)) {
              setZapButton("needApprove");
            }
          }
          if (tab === "Deposit") {
            if (
              Number(formatUnits(allowanceData, decimals)) < Number(amount) &&
              Number(amount) <= Number(balances[asset]?.assetBalance)
            ) {
              setZapButton("needApprove");
            }
            getZapDepositSwapAmounts(amount);
          }
        } catch (error) {
          console.error("ZAP ERROR:", error);
        }
      }
    }, 1000),
    [option, balances]
  );
  const zapInputHandler = (amount: string, asset: string) => {
    setZapButton("none");
    setZapTokens(false);
    setZapPreviewWithdraw(false);

    setInputs(
      (prevInputs: any) =>
        ({
          ...prevInputs,
          [asset]: {
            amount: amount,
          },
        } as TVaultInput)
    );

    // @ts-ignore
    debouncedZap(amount, asset);
  };

  const zapApprove = async () => {
    ///// ZAP TOKENS & UNDERLYING TOKENS
    const amount = inputs[option[0]]?.amount;

    if (option[0] !== underlyingToken?.address) {
      const decimals = getTokenData(option[0])?.decimals;

      if (amount && decimals) {
        try {
          const assetApprove = await writeContract({
            address: option[0],
            abi: ERC20ABI,
            functionName: "approve",
            args: [$platformData.zap as TAddress, maxUint256],
          });
          setLoader(true);
          const transaction = await _publicClient.waitForTransactionReceipt(
            assetApprove
          );

          if (transaction.status === "success") {
            lastTx.set(transaction?.transactionHash);
            const allowance = formatUnits(await getZapAllowance(), 18);

            if (Number(allowance) >= Number(amount)) {
              getZapDepositSwapAmounts(amount);
              setZapButton(tab.toLowerCase());
            }
            setLoader(false);
          }
        } catch (error) {
          lastTx.set("No approve hash...");
          setLoader(false);
          console.error("APPROVE ERROR:", error);
        }
      }
    } else {
      try {
        const assetApprove = await writeContract({
          address: underlyingToken?.address,
          abi: ERC20ABI,
          functionName: "approve",
          args: [vault as TAddress, maxUint256],
        });
        setLoader(true);

        const transaction = await _publicClient.waitForTransactionReceipt(
          assetApprove
        );

        if (transaction.status === "success") {
          lastTx.set(transaction?.transactionHash);
          const allowance = formatUnits(await getZapAllowance(), 18);
          if (Number(allowance) >= Number(amount)) {
            setZapButton(tab.toLowerCase());
          }
          setLoader(false);
        }
      } catch (error) {
        lastTx.set("No approve hash...");
        setLoader(false);
        console.error("APPROVE ERROR:", error);
      }
    }
  };
  const zapDeposit = async () => {
    ///// UNDERLYING
    if (underlyingToken?.address === option[0]) {
      try {
        const shares = parseUnits(underlyingShares, 18);
        const decimalPercent = BigInt(Math.floor(Number(slippage)));

        const out = shares - (shares * decimalPercent) / 100n;

        const depositAssets = await writeContract({
          address: vault as TAddress,
          abi: VaultABI,
          functionName: "depositAssets",
          args: [
            option as TAddress[],
            [parseUnits(inputs[option[0]]?.amount, 18)],
            out,
            $account as TAddress,
          ],
        });
        setLoader(true);

        const transaction = await _publicClient.waitForTransactionReceipt(
          depositAssets
        );
        if (transaction.status === "success") {
          lastTx.set(transaction?.transactionHash);
          setLoader(false);
        }
      } catch (error) {
        lastTx.set("No depositAssets hash...");
        setLoader(false);
        console.error("UNDERLYING DEPOSIT ERROR:", error);
      }
    } else {
      try {
        const decimalPercent = BigInt(Math.floor(Number(slippage)));

        const shares = parseUnits(zapShares, 18);

        const out = shares - (shares * decimalPercent) / 100n;

        const amountIn = parseUnits(
          inputs[option[0]].amount,
          getTokenData(option[0])?.decimals || 18
        );

        const router = zapTokens[0].router || zapTokens[1].router;

        const zapDeposit = await writeContract({
          address: $platformData.zap,
          abi: ZapABI,
          functionName: "deposit",
          args: [
            vault as TAddress,
            option[0],
            amountIn,
            router,
            [zapTokens[0].txData, zapTokens[1].txData],
            out,
            $account as TAddress,
          ],
        });
        setLoader(true);

        const transaction = await _publicClient.waitForTransactionReceipt(
          zapDeposit
        );
        if (transaction.status === "success") {
          lastTx.set(transaction?.transactionHash);
          setLoader(false);
        }
      } catch (error) {
        lastTx.set("No deposit hash...");
        setLoader(false);
        console.error("ZAP DEPOSIT ERROR:", error);
      }
    }
  };

  const getZapDepositSwapAmounts = async (amount: string) => {
    try {
      setLoader(true);

      const decimals = Number(getTokenData(option[0])?.decimals);
      const allowanceData = await getZapAllowance(option[0]);
      const zapAmounts = await readContract(_publicClient, {
        address: $platformData.zap,
        abi: ZapABI,
        functionName: "getDepositSwapAmounts",
        args: [vault as TAddress, option[0], parseUnits(amount, decimals)],
      });

      const promises = zapAmounts[0].map(
        async (toAddress, index) =>
          await get1InchRoutes(
            option[0],
            toAddress,
            decimals,
            String(zapAmounts[1][index]),
            setZapError,
            "deposit"
          )
      );

      const outData = await Promise.all(promises);
      setZapTokens(outData);

      const addresses: (TAddress | undefined)[] = outData.map(
        tokenOut => tokenOut?.address
      );
      let amounts = outData.map(tokenOut =>
        parseUnits(
          tokenOut?.amountOut as string,
          getTokenData(tokenOut?.address as TAddress)?.decimals as number
        )
      );

      ///// index ^ 1 --> XOR
      amounts = amounts.map((thisAmount, index) => {
        return !thisAmount
          ? parseUnits(amount, decimals) - zapAmounts[1][index ^ 1]
          : thisAmount;
      });

      const previewDepositAssets = await readContract(_publicClient, {
        address: vault as TAddress,
        abi: VaultABI,
        functionName: "previewDepositAssets",
        args: [addresses as TAddress[], amounts],
      });

      setZapShares(formatUnits(previewDepositAssets[1], 18));
      if (
        Number(formatUnits(allowanceData, decimals)) < Number(amount) &&
        Number(amount) <= Number(balances[option[0]]?.assetBalance)
      ) {
        setZapButton("needApprove");
      }
      if (
        Number(formatUnits(allowanceData, decimals)) >= Number(amount) &&
        Number(amount) <= Number(balances[option[0]]?.assetBalance)
      ) {
        setZapButton("deposit");
      }
      setLoader(false);
    } catch (error) {
      setLoader(false);
      console.error("ZAP DEPOSIT ERROR:", error);
    }
  };

  const withdrawZapApprove = async () => {
    try {
      const assetApprove = await writeContract({
        address: vault as TAddress,
        abi: ERC20ABI,
        functionName: "approve",
        args: [$platformData.zap, maxUint256],
      });
      setLoader(true);
      const transaction = await _publicClient.waitForTransactionReceipt({
        confirmations: 3,
        hash: assetApprove?.hash,
      });

      if (transaction.status === "success") {
        lastTx.set(transaction?.transactionHash);
        const newAllowance = await readContract(_publicClient, {
          address: option[0] as TAddress,
          abi: ERC20ABI,
          functionName: "allowance",
          args: [$account as TAddress, $platformData.zap as TAddress],
        });

        if (
          Number(formatUnits(newAllowance, 18)) >=
          Number(inputs[option[0]].amount)
        ) {
          setZapButton("withdraw");
        }
        setLoader(false);
      }
    } catch (error) {
      lastTx.set("No approve hash...");
      setLoader(false);
      console.error("ZAP ERROR:", error);
    }
  };

  /////

  ///// 1INCH DATA REFRESH
  const refreshData = async () => {
    if (!isRefresh) return;

    setRotation(rotation + 360);
    zapInputHandler(inputs[option[0]]?.amount, option[0]);
  };
  /////

  const approve = async (asset: TAddress) => {
    const needApprove = option.filter(
      (asset: TAddress) =>
        allowance &&
        formatUnits(
          allowance[asset].allowance[0],
          Number(getTokenData(asset)?.decimals)
        ) < inputs[asset].amount
    );
    if (vault) {
      try {
        const assetApprove = await writeContract({
          address: asset,
          abi: ERC20ABI,
          functionName: "approve",
          args: [vault, maxUint256],
        });
        setLoader(true);
        const transaction = await _publicClient.waitForTransactionReceipt({
          confirmations: 3,
          hash: assetApprove?.hash,
        });

        if (transaction.status === "success") {
          lastTx.set(transaction?.transactionHash);
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

          // this is a temp condition before rewrite
          if (
            needApprove.length == 1 &&
            formatUnits(newAllowance, Number(getTokenData(asset)?.decimals)) >=
              inputs[asset].amount
          ) {
            setIsApprove(1);
          }
          setLoader(false);
        }
      } catch (error) {
        lastTx.set("No approve hash...");
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
        // this is a temp condition before rewrite
        if (
          needApprove.length == 1 &&
          formatUnits(newAllowance, Number(getTokenData(asset)?.decimals)) >=
            inputs[asset].amount
        ) {
          setIsApprove(1);
        }
        setLoader(false);
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

    const decimalPercent = BigInt(Math.floor(Number(slippage)));

    const out = sharesOut - (sharesOut * decimalPercent) / 100n;
    try {
      const depositAssets = await writeContract({
        address: vault as TAddress,
        abi: VaultABI,
        functionName: "depositAssets",
        args: [$assets as TAddress[], input, out, $account as TAddress],
      });
      setLoader(true);
      const transaction = await _publicClient.waitForTransactionReceipt(
        depositAssets
      );

      if (transaction.status === "success") {
        lastTx.set(transaction?.transactionHash);
        setLoader(false);
      }
    } catch (error) {
      lastTx.set("No depositAssets hash...");
      setLoader(false);
      console.error("DEPOSIT ASSETS ERROR:", error);
    }
  };

  const withdraw = async () => {
    const sharesToBurn = parseUnits(inputs[option[0]]?.amount, 18);

    if (!sharesToBurn) return;

    ///// 2ASSETS -> UNDERLYING -> ZAP

    if (option.length > 1 || underlyingToken?.address === option[0]) {
      const decimalPercent = BigInt(Math.floor(Number(slippage)));
      const amountShares =
        sharesToBurn - (sharesToBurn * decimalPercent) / 100n;

      try {
        const withdrawAssets = await writeContract({
          address: vault as TAddress,
          abi: VaultABI,
          functionName: "withdrawAssets",
          args: [
            $assets as TAddress[],
            amountShares,
            Array.from({ length: option.length }, () => 0n),
          ],
        });
        setLoader(true);
        const transaction = await _publicClient.waitForTransactionReceipt(
          withdrawAssets
        );

        if (transaction.status === "success") {
          lastTx.set(transaction?.transactionHash);
          setLoader(false);
        }
      } catch (error) {
        lastTx.set("No withdrawAssets hash...");
        setLoader(false);
        console.error("WITHDRAW ERROR:", error);
      }
    } else {
      const optionAmount = Number(inputs[option[0]]?.amount);
      const calculatedValue =
        optionAmount - (optionAmount * Math.floor(Number(slippage))) / 100;
      const minAmountOut = parseUnits(
        String(calculatedValue),
        getTokenData(option[0])?.decimals as number
      );
      const router =
        zapPreviewWithdraw[0]?.router || zapPreviewWithdraw[1]?.router;

      try {
        const zapWithdraw = await writeContract({
          address: $platformData.zap,
          abi: ZapABI,
          functionName: "withdraw",
          args: [
            vault as TAddress,
            option[0],
            router,
            [zapPreviewWithdraw[0].txData, zapPreviewWithdraw[1].txData],
            sharesToBurn,
            minAmountOut,
          ],
        });
        setLoader(true);
        const transaction = await _publicClient.waitForTransactionReceipt(
          zapWithdraw
        );

        if (transaction.status === "success") {
          lastTx.set(transaction?.transactionHash);
          setLoader(false);
        }
      } catch (error) {
        lastTx.set("No withdraw hash...");
        setLoader(false);
        console.error("WITHDRAW ERROR:", error);
      }
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
        let assetsData: string[] = (await readContract(_publicClient, {
          address: strategy,
          abi: StrategyABI,
          functionName: "assets",
        })) as string[];

        assetsData = assetsData.map(address => address.toLowerCase());

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
        if (decimals) {
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
      balance[option[0]] = {
        assetBalance: underlyingToken.balance,
      };
    }
    setBalances(balance);
  };
  const debouncedPreviewWithdraw = useCallback(
    debounce(async (value: string) => {
      const balance = Number(
        formatUnits($vaultData[vault as TAddress].vaultUserBalance, 18)
      );
      if (!Number(value)) {
        setWithdrawAmount(false);
        setZapPreviewWithdraw(false);
        return;
      }

      if (Number(value) > balance) {
        setZapButton("insufficientBalance");
        return;
      }

      ///// UNDERLYING TOKEN
      const currentValue = parseUnits(value, 18);

      if (underlyingToken?.address === option[0]) {
        const { result } = await _publicClient.simulateContract({
          address: vault as TAddress,
          abi: VaultABI,
          functionName: "withdrawAssets",
          args: [option as TAddress[], currentValue, [0n]],
          account: $account as TAddress,
        });

        setWithdrawAmount([
          {
            symbol: underlyingToken?.symbol,
            amount: formatUnits(result[0], 18),
          },
        ]);
      } else {
        const { result } = await _publicClient.simulateContract({
          address: vault as TAddress,
          abi: VaultABI,
          functionName: "withdrawAssets",
          args: [$assets as TAddress[], currentValue, [0n, 0n]],
          account: $account as TAddress,
        });

        if (option?.length > 1) {
          const preview = result.map((amount: any, index: number) => {
            const tokenData: TTokenData | any = getTokenData($assets[index]);
            return {
              symbol: tokenData?.symbol,
              amount: formatUnits(amount, tokenData?.decimals),
            };
          });
          setWithdrawAmount(preview);
          setZapButton("withdraw");
        } else {
          try {
            setLoader(true);
            const allowanceData: any = formatUnits(await getZapAllowance(), 18);
            if (Number(formatUnits(allowanceData, 18)) < Number(value)) {
              setZapButton("needApprove");
              setLoader(false);
              return;
            }
            const promises = result.map(
              async (amount, index) =>
                await get1InchRoutes(
                  $assets[index],
                  option[0],
                  Number(getTokenData($assets[index])?.decimals),
                  amount,
                  setZapError,
                  "withdraw"
                )
            );
            setLoader(false);
            const outData = await Promise.all(promises);
            setZapPreviewWithdraw(outData);
            setZapButton("withdraw");
          } catch (error) {
            setLoader(false);
            console.error("WITHDRAW ERROR:", error);
          }
        }
      }
    }, 1000),
    [option, balances]
  );

  const previewWithdraw = async (value: string) => {
    //@ts-ignore
    debouncedPreviewWithdraw(value);
  };

  const checkAllowance = async () => {
    if (!$connected) return;
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
    // if (!Number(lastKeyPress.key2)) return;
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
            const token = tokensJson.tokens.find(
              token => token.address === option[0]
            );

            const decimals = token ? token.decimals + 18 : 24;

            amounts.push(parseUnits("1", decimals));
          }
        }
        try {
          const previewDepositAssets = await readContract(_publicClient, {
            address: vault as TAddress,
            abi: VaultABI,
            functionName: "previewDepositAssets",
            args: [$assets as TAddress[], amounts],
          });

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
  };
  const initVault = async () => {
    if ($vaults && vault) {
      setLocalVault($vaults[vault]);
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
    initVault();
  }, [$vaults, $vaultData, $vaultAssets, underlyingToken]);

  useEffect(() => {
    if (localVault) {
      const TD = getTimeDifference(localVault.lastHardWork);
      setTimeDifference(TD);
    }
  }, [localVault]);

  useEffect(() => {
    setZapButton("none");
    setWithdrawAmount(false);
    setUnderlyingShares(false);
    setZapShares(false);
    setZapTokens(false);
    setZapError(false);
    setZapPreviewWithdraw(false);
    setLoader(false);
  }, [option]);

  useEffect(() => {
    if (localVault) {
      selectTokensHandler();
    }
  }, [localVault, $tokens, defaultOptionSymbols]);

  // need tests
  useEffect(() => {
    setZapTokens(false);
  }, [inputs]);

  ///// interval refresh data
  useEffect(() => {
    if (zapTokens || withdrawAmount || zapPreviewWithdraw) {
      const reload = async () => {
        if (inputs[option[0]]?.amount) {
          if (tab === "Deposit") {
            getZapDepositSwapAmounts(inputs[option[0]]?.amount);
          }
          if (tab === "Withdraw") {
            previewWithdraw(inputs[option[0]]?.amount);
          }
        }
      };

      const intervalId = setInterval(reload, 10000);

      return () => clearInterval(intervalId);
    }
  }, [zapTokens, withdrawAmount, zapPreviewWithdraw, zapButton]);
  useEffect(() => {
    setSharesOut(false);
    setUnderlyingShares(false);
    setZapShares(false);
    if (
      option.length > 1 ||
      option[0] === underlyingToken?.address ||
      !inputs[option[0]]?.amount
    ) {
      setIsRefresh(false);
      return;
    }
    setIsRefresh(true);
  }, [option, inputs]);
  /////

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
          (token: any) => token.address.toLowerCase() === address.toLowerCase()
        );
        return token?.logoURI;
      });

      setActiveOptionToken({
        symbol: defaultOptionSymbols,
        address: defaultOptionAssets,
        logoURI: logos,
      });
    }
  }, [defaultOptionAssets, defaultOptionSymbols, optionTokens]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tokenSelectorRef.current &&
        event.target &&
        !tokenSelectorRef.current.contains(event.target as Node)
      ) {
        setTokenSelector(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [tokenSelectorRef]);

  return vault && $vaults[vault] ? (
    <main className="w-full mx-auto">
      <div className="flex justify-between items-center p-4 bg-button rounded-md">
        {localVault && (
          <div className="flex flex-col w-full">
            <div className="flex items-center gap-4 w-full lg:justify-between flex-wrap">
              <div className="flex items-center">
                <AssetsProportion
                  proportions={localVault.assetsProportions}
                  assets={localVault?.assets}
                  type="vault"
                />
                <span className="inline-flex text-[18px] font-bold whitespace-nowrap">
                  {localVault.symbol}
                </span>
              </div>

              <div className="flex items-center">
                <span className="text-[18px] lg:text-[20px]">
                  {localVault.name}
                </span>
              </div>
              <img
                className="w-8 h-8 rounded-full mx-1 hidden lg:flex"
                src={currentChain?.logoURI}
                alt={currentChain?.name}
                title={currentChain?.name}
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex items-start gap-5 mt-6 flex-col-reverse md:flex-row">
        <div className="w-full md:w-1/2 lg:w-3/5 ">
          {localVault && (
            <div className="flex flex-wrap justify-between items-center bg-button p-4 rounded-md md:h-[80px] mt-[-40px] md:mt-0">
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
              <div className="hidden lg:block">
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
                <div className="hidden lg:flex items-center gap-5 mr-3 ">
                  <button className="rounded-md bg-button flex justify-center items-center min-w-[140px]">
                    <a
                      className="flex items-center text-[15px] py-2 px-4 whitespace-nowrap"
                      href={`https://polygonscan.com/address/${strategyAddress}`}
                      target="_blank">
                      Strategy contract
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
                      Vault contract
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
                <div className="md:flex">
                  <div
                    className={`hidden lg:flex py-1 ${
                      localVault.strategyInfo.protocols.length > 1 && "pl-[8px]"
                    } mr-3 mb-3 md:mb-0`}>
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
                          className={`h-8 w-8 rounded-full ${
                            localVault.strategyInfo.protocols.length > 1 &&
                            "ml-[-8px]"
                          }`}
                        />
                      )
                    )}
                  </div>

                  <div
                    style={{
                      backgroundColor: localVault.strategyInfo.bgColor,
                      color: localVault.strategyInfo.color,
                    }}
                    className="px-3 rounded-[8px] flex items-center text-[18px] lg:text-[20px] md:py-1 lg:py-0">
                    <p>
                      {localVault.strategyInfo.name}
                      {localVault.strategySpecific
                        ? " " + localVault.strategySpecific
                        : ""}
                    </p>
                  </div>

                  <div
                    className="hidden lg:flex items-center ml-3"
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
                {!!localVault.assetsWithApr?.length && (
                  <div>
                    {localVault.assetsAprs.map((apr: string, index: number) => {
                      return (
                        <div
                          className="mt-2"
                          key={index}>
                          <p className="uppercase text-[13px] leading-3 text-[#8D8E96]">
                            {localVault.assetsWithApr[index]} APR
                          </p>
                          <p>{apr}%</p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-2">
                  <p className="uppercase text-[13px] leading-3 text-[#8D8E96]">
                    Strategy APR
                  </p>
                  <p>
                    {Number(formatUnits(localVault.strategyApr, 3)).toFixed(2)}%
                  </p>
                </div>

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
            {localVault &&
              localVault?.assets.map((asset: any) => {
                const assetData: TToken | any = getTokenData(asset.address);

                const tokenAssets = TOKENS_ASSETS.find(tokenAsset => {
                  return tokenAsset.addresses.includes(assetData?.address);
                });

                return (
                  assetData && (
                    <article
                      className="rounded-md p-3 mb-4 flex bg-[#32343f]"
                      key={asset.address}>
                      <div className="flex w-full flex-col gap-3">
                        <div className="flex w-full justify-between items-center  flex-wrap">
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
                          <div className="flex flex-row flex-wrap gap-1 md:gap-3 md:mt-0 mt-2">
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
                                href={`https://polygonscan.com/token/${asset.address}`}
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

                        {$assetsPrices && (
                          <div className="flex justify-start items-center text-[16px]">
                            <p>
                              Price: $
                              {formatUnits(
                                $assetsPrices[asset.address]?.tokenPrice,
                                18
                              )}
                            </p>
                          </div>
                        )}

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
                  )
                );
              })}
          </article>
        </div>
        <div className="w-full md:w-1/2 lg:w-2/5">
          {localVault && (
            <div className="flex justify-between flex-wrap items-center bg-button px-5 py-2 md:py-4 rounded-md md:h-[80px]">
              <div className="flex flex-col my-2 md:my-0">
                <p className="uppercase text-[14px] leading-3 text-[#8D8E96]">
                  Your Balance
                </p>

                <div className="text-[20px] h-8 flex">
                  <p className="mr-1">
                    {formatFromBigInt(localVault.balance, 18).toFixed(5)}
                  </p>
                  <p className="whitespace-nowrap md:hidden lg:block">
                    / $
                    {(
                      formatFromBigInt(
                        localVault.shareprice,
                        18,
                        "withDecimals"
                      ) *
                      Number(
                        formatFromBigInt(localVault.balance, 18, "withDecimals")
                      )
                    ).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex flex-col my-2 md:my-0">
                {timeDifference && (
                  <div className="flex flex-col justify-between">
                    <p className="uppercase text-[14px] leading-3 text-[#8D8E96] mb-[7px]">
                      Last Hard Work
                    </p>
                    {timeDifference?.days ? (
                      <>
                        {timeDifference?.days < 1000 ? (
                          <div className="flex text-[14px] bg-[#6F5648] text-[#F2C4A0] px-2 rounded-lg border-[2px] border-[#AE642E] text-center">
                            {timeDifference.days}
                            {timeDifference.days > 1 ? " days" : " day"}{" "}
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
              className="w-full px-4 mb-10 pb-5">
              <div className="flex items-center mt-4 gap-3 relative">
                {optionTokens && (
                  <div
                    className="relative select-none w-full"
                    ref={tokenSelectorRef}>
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
                        <p className="text-[16px] md:text-[15px] lg:text-[20px]">
                          {activeOptionToken?.symbol}
                        </p>
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
                        className="text-center cursor-pointer opacity-60 hover:opacity-100 flex items-center justify-start px-3 gap-3">
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
                        <p className="ml-[-4px] text-[16px] md:text-[15px] lg:text-[20px] py-1 lg:py-0">
                          {defaultOptionSymbols}
                        </p>
                      </div>
                      {underlyingToken && (
                        <div
                          className="text-center cursor-pointer opacity-60 hover:opacity-100 flex items-center justify-start px-5 gap-3 ml-3"
                          onClick={() => {
                            optionHandler(
                              [underlyingToken?.address],
                              underlyingToken?.symbol,
                              underlyingToken?.address,
                              "/protocols/Gamma.png"
                            );
                          }}>
                          {underlyingToken?.logoURI && (
                            <img
                              className="max-w-6 max-h-6 rounded-full "
                              src={underlyingToken.logoURI}
                              alt="logo"
                            />
                          )}
                          <p className="ml-2 text-[16px] md:text-[15px] lg:text-[20px] py-1 lg:py-0">
                            {underlyingToken.symbol}
                          </p>
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
                              className="text-center cursor-pointer opacity-60 hover:opacity-100 flex items-center justify-start px-3 gap-3 ml-3"
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
                              <p className="ml-2 text-[16px] md:text-[15px] lg:text-[20px] py-1 lg:py-0">
                                {symbol}
                              </p>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                {$connected && (
                  <>
                    {" "}
                    <svg
                      fill={isRefresh ? "#ffffff" : "#959595"}
                      height="22"
                      width="22"
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      xmlnsXlink="http://www.w3.org/1999/xlink"
                      viewBox="0 0 512 512"
                      xmlSpace="preserve"
                      className={`${
                        isRefresh ? "cursor-pointer" : "cursor-default"
                      } transition-transform duration-500`}
                      style={{ transform: `rotate(${rotation}deg)` }}
                      onClick={refreshData}>
                      <g>
                        <g>
                          <path
                            d="M511.957,185.214L512,15.045l-67.587,67.587l-7.574-7.574c-48.332-48.332-112.593-74.95-180.946-74.95
			C114.792,0.107,0,114.901,0,256s114.792,255.893,255.893,255.893S511.785,397.099,511.785,256h-49.528
			c0,113.79-92.575,206.365-206.365,206.365S49.528,369.79,49.528,256S142.103,49.635,255.893,49.635
			c55.124,0,106.947,21.467,145.925,60.445l7.574,7.574l-67.58,67.58L511.957,185.214z"
                          />
                        </g>
                      </g>
                    </svg>
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      className={`settingsModal cursor-pointer transition-transform transform ${
                        settingsModal ? "rotate-180" : "rotate-0"
                      }`}
                      onClick={() => setSettingsModal(prev => !prev)}>
                      <path
                        className="settingsModal"
                        d="M20.83 14.6C19.9 14.06 19.33 13.07 19.33 12C19.33 10.93 19.9 9.93999 20.83 9.39999C20.99 9.29999 21.05 9.1 20.95 8.94L19.28 6.06C19.22 5.95 19.11 5.89001 19 5.89001C18.94 5.89001 18.88 5.91 18.83 5.94C18.37 6.2 17.85 6.34 17.33 6.34C16.8 6.34 16.28 6.19999 15.81 5.92999C14.88 5.38999 14.31 4.41 14.31 3.34C14.31 3.15 14.16 3 13.98 3H10.02C9.83999 3 9.69 3.15 9.69 3.34C9.69 4.41 9.12 5.38999 8.19 5.92999C7.72 6.19999 7.20001 6.34 6.67001 6.34C6.15001 6.34 5.63001 6.2 5.17001 5.94C5.01001 5.84 4.81 5.9 4.72 6.06L3.04001 8.94C3.01001 8.99 3 9.05001 3 9.10001C3 9.22001 3.06001 9.32999 3.17001 9.39999C4.10001 9.93999 4.67001 10.92 4.67001 11.99C4.67001 13.07 4.09999 14.06 3.17999 14.6H3.17001C3.01001 14.7 2.94999 14.9 3.04999 15.06L4.72 17.94C4.78 18.05 4.89 18.11 5 18.11C5.06 18.11 5.12001 18.09 5.17001 18.06C6.11001 17.53 7.26 17.53 8.19 18.07C9.11 18.61 9.67999 19.59 9.67999 20.66C9.67999 20.85 9.82999 21 10.02 21H13.98C14.16 21 14.31 20.85 14.31 20.66C14.31 19.59 14.88 18.61 15.81 18.07C16.28 17.8 16.8 17.66 17.33 17.66C17.85 17.66 18.37 17.8 18.83 18.06C18.99 18.16 19.19 18.1 19.28 17.94L20.96 15.06C20.99 15.01 21 14.95 21 14.9C21 14.78 20.94 14.67 20.83 14.6ZM12 15C10.34 15 9 13.66 9 12C9 10.34 10.34 9 12 9C13.66 9 15 10.34 15 12C15 13.66 13.66 15 12 15Z"
                        fill="currentColor"></path>
                    </svg>
                  </>
                )}

                {settingsModal && (
                  <SettingsModal
                    slippageState={slippage}
                    setSlippageState={setSlippage}
                    setModalState={setSettingsModal}
                  />
                )}
              </div>

              {tab === "Deposit" &&
                ($connected ? (
                  <>
                    {option?.length > 1 ? (
                      <>
                        <div className="flex flex-col items-center justify-center gap-3 mt-2 w-full">
                          {option.map((asset: any) => (
                            <div key={asset}>
                              <div className="text-[16px] text-[gray] flex items-center gap-1 ml-2">
                                <p>Balance:</p>

                                <p>{balances[asset]?.assetBalance}</p>
                              </div>

                              <div className="rounded-xl  relative max-h-[150px] border-[2px] border-[#6376AF] w-full">
                                {$connected && (
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
                                )}
                                <input
                                  className="w-[58%] pl-[50px] py-3 flex items-center h-full  text-[25px] bg-transparent"
                                  list="amount"
                                  id={asset}
                                  name="amount"
                                  placeholder="0"
                                  value={
                                    inputs &&
                                    inputs[asset] &&
                                    inputs[asset].amount
                                  }
                                  onChange={e =>
                                    handleInputChange(
                                      e.target.value,
                                      e.target.id
                                    )
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
                                    if (token.address.toLowerCase() === asset) {
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
                              {$assetsPrices && inputs[asset]?.amount > 0 && (
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
                        {!loader ? (
                          <>
                            {" "}
                            {isApprove === 1 ? (
                              <button
                                className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                                type="button"
                                onClick={deposit}>
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
                                        onClick={() =>
                                          approve(asset as TAddress)
                                        }>
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
                                  INSUFFICIENT BALANCE
                                </button>
                              )
                            )}
                          </>
                        ) : (
                          <Loader />
                        )}
                      </>
                    ) : (
                      <div>
                        <div className="flex flex-col mt-[15px] text-[15px] w-full">
                          {balances[option[0]] && (
                            <div className="text-left text-[gray] ml-2">
                              Balance: {balances[option[0]].assetBalance}
                            </div>
                          )}

                          <div className="rounded-xl  relative max-h-[150px] border-[2px] border-[#6376AF] w-full">
                            <div className="absolute top-[30%] left-[5%]">
                              {tokensJson.tokens.map(token => {
                                if (token.address === option[0]) {
                                  return (
                                    <div
                                      className="flex items-center"
                                      key={token.address}>
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
                            {$connected && balances[option[0]] && (
                              <div>
                                <div
                                  className={`absolute right-0 pt-[15px] pl-[15px] pr-3 pb-3 ${
                                    underlyingToken?.address === option[0]
                                      ? "bottom-[-9%]"
                                      : "bottom-0"
                                  }`}>
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
                                className={` py-3 flex items-center h-full   bg-transparent ${
                                  underlyingToken?.address === option[0]
                                    ? "text-[16px] w-[70%] pl-[10px]"
                                    : "text-[25px] w-[58%] pl-[50px]"
                                } `}
                              />
                            )}
                          </div>
                          {$assetsPrices && inputs[option[0]]?.amount > 0 && (
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
                          {!loader && (
                            <>
                              {zapTokens && (
                                <>
                                  {zapTokens.map((token: any) => (
                                    <div
                                      className="text-[18px]  flex items-center gap-1 ml-2"
                                      key={token.address}>
                                      {token.address !== option[0] && (
                                        <div className="flex items-center gap-1 mt-2">
                                          <img
                                            src="/oneInch.svg"
                                            alt="1inch logo"
                                            title="1inch"
                                          />
                                          {zapError ? (
                                            <img
                                              src="/error.svg"
                                              alt="error img"
                                              title="error"
                                            />
                                          ) : (
                                            <>
                                              <div className="flex items-center gap-1">
                                                <p>
                                                  {Number(
                                                    token.amountIn
                                                  ).toFixed(2)}
                                                </p>
                                                <img
                                                  src={
                                                    getTokenData(option[0])
                                                      ?.logoURI
                                                  }
                                                  title={
                                                    getTokenData(option[0])
                                                      ?.symbol
                                                  }
                                                  alt={
                                                    getTokenData(option[0])
                                                      ?.symbol
                                                  }
                                                  className="w-6 h-6 rounded-full"
                                                />
                                              </div>
                                              -&gt;
                                              <div className="flex items-center gap-1">
                                                <p>
                                                  {Number(
                                                    token.amountOut
                                                  ).toFixed(2)}
                                                </p>
                                                <img
                                                  src={token.img}
                                                  title={token.symbol}
                                                  alt={token.symbol}
                                                  className="w-6 h-6 rounded-full"
                                                />
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </>
                              )}

                              {underlyingShares &&
                                inputs[option[0]]?.amount > 0 && (
                                  <p className="text-left  ml-2 mt-3 text-[18px]">
                                    Shares: {underlyingShares}
                                  </p>
                                )}
                              {zapShares && inputs[option[0]]?.amount > 0 && (
                                <p className="text-left  ml-2 mt-3 text-[18px]">
                                  Shares: {zapShares}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        {!loader ? (
                          <>
                            {" "}
                            {zapButton === "insufficientBalance" ? (
                              <button
                                disabled
                                className="mt-2 w-full flex items-center justify-center bg-[#6F5648] text-[#F2C4A0] border-[#AE642E] py-3 rounded-md">
                                INSUFFICIENT BALANCE
                              </button>
                            ) : zapButton === "needApprove" ? (
                              <button
                                className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                                type="button"
                                onClick={zapApprove}>
                                Approve{" "}
                                {underlyingToken?.address === option[0]
                                  ? underlyingToken.symbol
                                  : getTokenData(option[0])?.symbol}
                              </button>
                            ) : (
                              zapButton === "deposit" && (
                                <button
                                  className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                                  type="button"
                                  onClick={zapDeposit}>
                                  Deposit
                                </button>
                              )
                            )}
                          </>
                        ) : (
                          <Loader />
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                    onClick={() => open()}>
                    CONNECT WALLET
                  </button>
                ))}

              {tab === "Withdraw" &&
                ($connected ? (
                  <>
                    <div className="grid mt-[15px] text-[15px] w-full">
                      {balances[option[0]] && (
                        <div className="text-left text-[gray] ml-2">
                          Balance:{" "}
                          {parseFloat(
                            formatUnits($vaultData[vault].vaultUserBalance, 18)
                          )}
                        </div>
                      )}

                      <div className="rounded-xl  relative max-h-[150px] border-[2px] border-[#6376AF] w-full">
                        {balances[option[0]] && (
                          <div className="absolute right-0 pt-[15px] pl-[15px] pr-3 pb-3 bottom-[-9%]">
                            <div className="flex items-center">
                              <button
                                onClick={() => {
                                  zapInputHandler(
                                    formatUnits(
                                      $vaultData[vault]?.vaultUserBalance,
                                      18
                                    ),
                                    option[0]
                                  );
                                  previewWithdraw(
                                    formatUnits(
                                      $vaultData[vault]?.vaultUserBalance,
                                      18
                                    )
                                  );
                                }}
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
                            zapInputHandler(e.target.value, e.target.id);
                            previewWithdraw(e.target.value);
                            handleInputChange(e.target.value, e.target.id);
                          }}
                          onKeyDown={evt =>
                            ["e", "E", "+", "-", " ", ","].includes(evt.key) &&
                            evt.preventDefault()
                          }
                          pattern="^[0-9]*[.,]?[0-9]*$"
                          inputMode="decimal"
                          className="py-3 flex items-center h-full  bg-transparent  text-[16px] w-[70%] pl-[10px]"
                        />
                      </div>

                      {$assetsPrices && inputs[option[0]]?.amount > 0 && (
                        <div className="text-[16px] text-[gray] flex items-center gap-1 ml-2">
                          <p>
                            $
                            {(
                              formatFromBigInt(
                                localVault.shareprice,
                                18,
                                "withDecimals"
                              ) * inputs[option[0]]?.amount
                            ).toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                    {!loader ? (
                      <>
                        {(withdrawAmount || zapPreviewWithdraw) && (
                          <div>
                            <div className="my-2 ml-2 flex flex-col gap-2">
                              {withdrawAmount &&
                                withdrawAmount?.map(
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
                              {zapPreviewWithdraw && (
                                <>
                                  {zapPreviewWithdraw?.map(
                                    ({
                                      address,
                                      amountIn,
                                      amountOut,
                                    }: {
                                      address: TAddress;
                                      amountIn: string;
                                      amountOut: string;
                                      symbol: string;
                                    }) => (
                                      <div key={amountIn}>
                                        {address !== option[0] && (
                                          <div className="flex">
                                            <img
                                              src="/oneInch.svg"
                                              alt="1inch logo"
                                              title="1inch"
                                            />
                                            {!!amountOut ? (
                                              <>
                                                <div className="flex items-center gap-1">
                                                  <p>
                                                    {Number(amountIn).toFixed(
                                                      5
                                                    )}
                                                  </p>
                                                  <img
                                                    src={
                                                      getTokenData(address)
                                                        ?.logoURI
                                                    }
                                                    title={
                                                      getTokenData(address)
                                                        ?.symbol
                                                    }
                                                    alt={
                                                      getTokenData(address)
                                                        ?.symbol
                                                    }
                                                    className="w-6 h-6 rounded-full"
                                                  />
                                                </div>
                                                -&gt;
                                                <div className="flex items-center gap-1">
                                                  <p>
                                                    {Number(amountOut).toFixed(
                                                      5
                                                    )}
                                                  </p>

                                                  <img
                                                    src={
                                                      getTokenData(option[0])
                                                        ?.logoURI
                                                    }
                                                    title={
                                                      getTokenData(option[0])
                                                        ?.symbol
                                                    }
                                                    alt={
                                                      getTokenData(option[0])
                                                        ?.symbol
                                                    }
                                                    className="w-6 h-6 rounded-full"
                                                  />
                                                </div>
                                              </>
                                            ) : (
                                              <img
                                                src="/error.svg"
                                                alt="error img"
                                                title="error"
                                              />
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  )}
                                  <div className="flex items-center gap-1">
                                    <img
                                      src={getTokenData(option[0])?.logoURI}
                                      alt={getTokenData(option[0])?.symbol}
                                      title={getTokenData(option[0])?.symbol}
                                      className="w-6 h-6 rounded-full"
                                    />
                                    <p>
                                      {(
                                        ((Number(
                                          zapPreviewWithdraw[0].amountIn
                                        ) +
                                          Number(
                                            zapPreviewWithdraw[1].amountIn
                                          )) *
                                          Number(
                                            formatFromBigInt(
                                              localVault.shareprice,
                                              18,
                                              "withDecimals"
                                            )
                                          )) /
                                        Number(
                                          formatUnits(
                                            $assetsPrices[option[0]].tokenPrice,
                                            18
                                          )
                                        )
                                      ).toFixed(5)}
                                    </p>
                                    <p>{`($${(
                                      (Number(zapPreviewWithdraw[0].amountIn) +
                                        Number(
                                          zapPreviewWithdraw[1].amountIn
                                        )) *
                                      formatFromBigInt(
                                        localVault.shareprice,
                                        18,
                                        "withDecimals"
                                      )
                                    ).toFixed(2)})`}</p>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {zapButton === "insufficientBalance" ? (
                          <button
                            disabled
                            className="mt-2 w-full flex items-center justify-center bg-[#6F5648] text-[#F2C4A0] border-[#AE642E] py-3 rounded-md">
                            INSUFFICIENT BALANCE
                          </button>
                        ) : zapButton === "needApprove" ? (
                          <button
                            className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                            type="button"
                            onClick={withdrawZapApprove}>
                            Approve
                          </button>
                        ) : (
                          (zapButton === "withdraw" ||
                            zapButton === "deposit") && (
                            <button
                              type="button"
                              className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                              onClick={withdraw}>
                              WITHDRAW
                            </button>
                          )
                        )}
                      </>
                    ) : (
                      <Loader />
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    className="mt-2 w-full flex items-center justify-center bg-[#486556] text-[#B0DDB8] border-[#488B57] py-3 rounded-md"
                    onClick={() => open()}>
                    CONNECT WALLET
                  </button>
                ))}
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
