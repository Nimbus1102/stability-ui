import { useState, useEffect, useRef, useMemo } from "react";

import { useWeb3Modal } from "@web3modal/wagmi/react";

// import { formatUnits} from "viem";

import { useStore } from "@nanostores/react";

// import { deployments } from "@stabilitydao/stability";

import { APRModal } from "./APRModal";
import { VSHoldModal } from "./VSHoldModal";
import { ColumnSort } from "./ColumnSort";
import { Pagination } from "./Pagination";
import { Filters } from "./Filters";
import { Portfolio } from "./Portfolio";

import {
  AssetsProportion,
  VaultState,
  TimeDifferenceIndicator,
  Loader,
  ErrorMessage,
  ShortAddress,
} from "@components";

import {
  vaults,
  isVaultsLoaded,
  hideFeeApr,
  error,
  aprFilter,
  connected,
  platformVersions,
  currentChainID,
  // assetsPrices,
} from "@store";

import {
  formatNumber,
  formatFromBigInt,
  getTimeDifference,
  // getDate,
  // getTokenData,
} from "@utils";

import {
  TABLE,
  TABLE_FILTERS,
  PAGINATION_VAULTS,
  STABLECOINS,
  CHAINS,
  // WBTC,
  // WETH,
  // WMATIC,
} from "@constants";

// import { platforms, PlatformABI } from "@web3";

import type {
  TVault,
  TTableColumn,
  TTableFilters,
  TTAbleFiltersVariant,
  THoldData,
  TPendingPlatformUpgrade,
  TAddress,
  TUpgradesTable,
  TEarningData,
} from "@types";

// type TToken = {
//   logo: string;
//   price: string;
// };

const Vaults = () => {
  const { open } = useWeb3Modal();

  const $vaults = useStore(vaults);
  const $isVaultsLoaded = useStore(isVaultsLoaded);
  const $error = useStore(error);
  const $hideFeeAPR = useStore(hideFeeApr);
  const $aprFilter = useStore(aprFilter);
  const $connected = useStore(connected);
  // const $publicClient = useStore(publicClient);
  const $platformVersions = useStore(platformVersions);
  const $currentChainID = useStore(currentChainID);
  // const $assetsPrices = useStore(assetsPrices);

  // const [tokens, setTokens] = useState<TToken[]>([]);

  const search: React.RefObject<HTMLInputElement> = useRef(null);

  const [localVaults, setLocalVaults] = useState<TVault[]>([]);
  const [filteredVaults, setFilteredVaults] = useState<TVault[]>([]);
  const [aprModal, setAprModal] = useState({
    earningData: {} as TEarningData,
    daily: 0,
    lastHardWork: "0",
    symbol: "",
    state: false,
    pool: {},
  });

  const [vsHoldModal, setVsHoldModal] = useState({
    lifetimeTokensHold: [],
    vsHoldAPR: 0,
    lifetimeVsHoldAPR: 0,
    created: 0,
    state: false,
    isVsActive: false,
  });

  const [platformUpdates, setPlatformUpdates] =
    useState<TPendingPlatformUpgrade>();

  const [lockTime, setLockTime] = useState({ start: "", end: "" });
  const [upgradesTable, setUpgradesTable] = useState<TUpgradesTable[]>([]);

  const [isLocalVaultsLoaded, setIsLocalVaultsLoaded] = useState(false);

  const [currentTab, setCurrentTab] = useState(1);

  const [tableStates, setTableStates] = useState(TABLE);
  const [tableFilters, setTableFilters] = useState(TABLE_FILTERS);
  const [activeNetworks, setActiveNetworks] = useState(CHAINS);

  const lastTabIndex = currentTab * PAGINATION_VAULTS;
  const firstTabIndex = lastTabIndex - PAGINATION_VAULTS;
  const currentTabVaults = filteredVaults.slice(firstTabIndex, lastTabIndex);

  const userVaultsCondition =
    tableFilters.find((filter) => filter.name === "My vaults")?.state &&
    !$connected;

  const toVault = (network: string, address: string) => {
    window.location.href = `/vault/${network}/${address}`;
  };

  const compareHandler = (
    a: any,
    b: any,
    dataType: string,
    sortOrder: string
  ) => {
    if (dataType === "number") {
      return sortOrder === "ascendentic"
        ? Number(a) - Number(b)
        : Number(b) - Number(a);
    }
    if (dataType === "string") {
      return sortOrder === "ascendentic"
        ? a.localeCompare(b)
        : b.localeCompare(a);
    }
    return 0;
  };

  const setURLFilters = (filters: TTableFilters[]) => {
    const searchParams = new URLSearchParams(window.location.search);

    const tagsParam = searchParams.get("tags");
    const strategyParam = searchParams.get("strategy");
    const vaultsParam = searchParams.get("vaults");
    const statusParam = searchParams.get("status");
    const chainParam = searchParams.get("chain");

    if (tagsParam) {
      filters = filters.map((f) =>
        f.name.toLowerCase() === tagsParam ? { ...f, state: true } : f
      );
    }
    if (strategyParam) {
      filters = filters.map((f) => {
        return f.name.toLowerCase() === "strategy"
          ? {
              ...f,
              variants:
                f.variants?.map((variant: TTAbleFiltersVariant) => {
                  return variant.name.toLowerCase() ===
                    strategyParam.toLowerCase()
                    ? { ...variant, state: true }
                    : { ...variant, state: false };
                }) || [],
            }
          : f;
      });
    }
    if (vaultsParam) {
      filters = filters.map((f) => {
        if (f.name.toLowerCase() === "my vaults") {
          return vaultsParam === "my"
            ? { ...f, state: true }
            : { ...f, state: false };
        }
        return f;
      });
    }
    if (statusParam) {
      filters = filters.map((f) => {
        if (f.name.toLowerCase() === "active") {
          return statusParam === "active"
            ? { ...f, state: true }
            : { ...f, state: false };
        }
        return f;
      });
    }
    if (chainParam) {
      activeNetworksHandler(chainParam);
    }
    setTableFilters(filters);
  };

  const activeNetworksHandler = async (chainID: string) => {
    ///// For vaults URL filters
    const newUrl = new URL(window.location.href);
    const params = new URLSearchParams(newUrl.search);
    /////

    let updatedNetworks = activeNetworks.map((network) =>
      network.id === chainID ? { ...network, active: !network.active } : network
    );

    const allActive = activeNetworks.every((network) => network.active);
    const allInactive = updatedNetworks.every((network) => !network.active);

    if (allInactive) {
      updatedNetworks = activeNetworks.map((network) => ({
        ...network,
        active: true,
      }));
    } else if (allActive) {
      updatedNetworks = activeNetworks.map((network) => ({
        ...network,
        active: network.id === chainID,
      }));
    }

    /// URL set
    const activeNetworksLength = updatedNetworks.filter(
      (network) => network.active
    )?.length;

    if (activeNetworksLength === updatedNetworks.length) {
      params.delete("chain");
    } else {
      updatedNetworks.forEach((network) => {
        if (network.active) {
          params.set("chain", network.id);

          newUrl.search = `?${params.toString()}`;
          window.history.pushState({}, "", newUrl.toString());
        }
      });
    }

    newUrl.search = `?${params.toString()}`;
    window.history.pushState({}, "", newUrl.toString());

    setActiveNetworks(updatedNetworks);
  };

  const tableHandler = (table: TTableColumn[] = tableStates) => {
    const searchValue: string = String(search?.current?.value.toLowerCase());

    let activeNetworksVaults: { [key: string]: TVault[] } = {};

    activeNetworks.forEach((network) => {
      if (network.active) {
        activeNetworksVaults[network.id] = $vaults[network.id];
      }
    });

    //@ts-ignore
    const mixedVaults: { [key: string]: TVault } = Object.values(
      activeNetworksVaults
    ).reduce<{
      [key: string]: TVault;
    }>((acc, value) => {
      return { ...acc, ...value };
    }, {});

    let sortedVaults = Object.values(mixedVaults).sort(
      (a: TVault, b: TVault) => Number(b.tvl) - Number(a.tvl)
    );
    //filter
    tableFilters.forEach((f) => {
      if (!f.state) return;
      switch (f.type) {
        case "single":
          if (f.name === "Stablecoins") {
            sortedVaults = sortedVaults.filter((vault: TVault) => {
              if (vault.assets.length > 1) {
                return (
                  STABLECOINS.includes(vault.assets[0].address) &&
                  STABLECOINS.includes(vault.assets[1].address)
                );
              }
              return STABLECOINS.includes(vault.assets[0].address);
            });
          }
          break;
        case "multiple":
          // if (!f.variants) break;
          // if (f.name === "Strategy") {
          //   const strategyName = f.variants.find(
          //     (variant: TTAbleFiltersVariant) => variant.state
          //   )?.name;
          //   if (strategyName) {
          //     sortedVaults = sortedVaults.filter(
          //       (vault: TVault) => vault.strategyInfo.shortName === strategyName
          //     );
          //   }
          // }
          break;
        case "sample":
          if (f.name === "My vaults") {
            sortedVaults = sortedVaults.filter(
              (vault: TVault) => vault.balance
            );
          }
          if (f.name === "Active") {
            sortedVaults = sortedVaults.filter(
              (vault: TVault) => vault.status === "Active"
            );
          }
          break;
        case "dropdown":
          if (!f.variants) break;
          if (f.name === "Strategy") {
            const strategyName = f.variants.find(
              (variant: TTAbleFiltersVariant) => variant.state
            )?.name;
            if (strategyName) {
              sortedVaults = sortedVaults.filter(
                (vault: TVault) => vault.strategyInfo.shortName === strategyName
              );
            }
          }
          break;
        default:
          console.error("NO FILTER CASE");
          break;
      }
    });
    //sort
    table.forEach((state: TTableColumn) => {
      if (state.sortType !== "none") {
        if (state.keyName === "earningData") {
          const fees = $hideFeeAPR ? "withoutFees" : "withFees";

          sortedVaults = [...sortedVaults].sort((a, b) =>
            compareHandler(
              a[state.keyName as keyof TVault]?.apr[fees][$aprFilter],
              b[state.keyName as keyof TVault]?.apr[fees][$aprFilter],
              state.dataType,
              state.sortType
            )
          );
        } else {
          sortedVaults = [...sortedVaults].sort((a, b) =>
            compareHandler(
              a[state.keyName as keyof TVault],
              b[state.keyName as keyof TVault],
              state.dataType,
              state.sortType
            )
          );
        }
      }
    });
    //search
    sortedVaults = sortedVaults.filter(
      (vault: TVault) =>
        vault.symbol.toLowerCase().includes(searchValue) ||
        vault.assetsSymbol.toLowerCase().includes(searchValue)
    );
    // pagination upd
    if (currentTab != 1) {
      setCurrentTab(1);
    }

    setFilteredVaults(sortedVaults);
    setTableStates(table);
  };

  // const fetchPlatformUpdates = async () => {
  //   try {
  //     const pendingPlatformUpgrade: any = await $publicClient?.readContract({
  //       address: platforms[$currentChainID],
  //       abi: PlatformABI,
  //       functionName: "pendingPlatformUpgrade",
  //     });
  //     let upgrated = [];
  //     if (pendingPlatformUpgrade?.proxies.length) {
  //       const promises = pendingPlatformUpgrade.proxies.map(
  //         async (proxy: TAddress, index: number) => {
  //           const moduleContracts = Object.keys(deployments[$currentChainID]);
  //           const upgratedData = await Promise.all(
  //             moduleContracts.map(async (moduleContract: string) => {
  //               //Can't use CoreContracts type
  //               //@ts-ignore
  //               const address = deployments[$currentChainID][moduleContract];
  //               if (proxy === address) {
  //                 const oldImplementation = await $publicClient?.readContract({
  //                   address: address,
  //                   abi: [
  //                     {
  //                       inputs: [],
  //                       name: "implementation",
  //                       outputs: [
  //                         {
  //                           internalType: "address",
  //                           name: "",
  //                           type: "address",
  //                         },
  //                       ],
  //                       stateMutability: "view",
  //                       type: "function",
  //                     },
  //                   ],
  //                   functionName: "implementation",
  //                 });
  //                 const oldImplementationVersion =
  //                   await $publicClient?.readContract({
  //                     address: oldImplementation,
  //                     abi: PlatformABI,
  //                     functionName: "VERSION",
  //                   });
  //                 const newImplementationVersion =
  //                   await $publicClient?.readContract({
  //                     address: pendingPlatformUpgrade.newImplementations[index],
  //                     abi: PlatformABI,
  //                     functionName: "VERSION",
  //                   });
  //                 return {
  //                   contract: moduleContract,
  //                   oldVersion: oldImplementationVersion,
  //                   newVersion: newImplementationVersion,
  //                   proxy: proxy,
  //                   oldImplementation: oldImplementation,
  //                   newImplementation:
  //                     pendingPlatformUpgrade.newImplementations[index],
  //                 };
  //               }
  //             })
  //           );
  //           return upgratedData.filter((data) => data !== undefined);
  //         }
  //       );
  //       upgrated = (await Promise.all(promises)).flat();
  //     }

  //     /////***** TIME CHECK  *****/////
  //     const lockTime: any = await $publicClient?.readContract({
  //       address: platforms[$currentChainID],
  //       abi: PlatformABI,
  //       functionName: "TIME_LOCK",
  //     });
  //     const platformUpgradeTimelock: any = await $publicClient?.readContract({
  //       address: platforms[$currentChainID],
  //       abi: PlatformABI,
  //       functionName: "platformUpgradeTimelock",
  //     });
  //     if (lockTime && platformUpgradeTimelock) {
  //       setLockTime({
  //         start: getDate(Number(platformUpgradeTimelock - lockTime)),
  //         end: getDate(Number(platformUpgradeTimelock)),
  //       });
  //     }
  //     /////***** SET DATA  *****/////
  //     setUpgradesTable(upgrated);
  //     setPlatformUpdates(pendingPlatformUpgrade);
  //   } catch (error) {
  //     console.error("Error fetching platform updates:", error);
  //   }
  // };

  const initFilters = (vaults: TVault[]) => {
    let shortNames: any[] = [
      ...new Set(vaults.map((vault) => vault.strategyInfo.shortName)),
    ];

    shortNames = shortNames.map((name: string) => ({
      name: name,
      state: false,
    }));

    const newFilters = tableFilters.map((f) =>
      f.name === "Strategy" ? { ...f, variants: shortNames } : f
    );
    setURLFilters(newFilters);
  };

  const initVaults = async () => {
    if ($vaults) {
      //@ts-ignore
      const mixedVaults: { [key: string]: TVault } = Object.values(
        $vaults
      ).reduce<{ [key: string]: TVault }>((acc, value) => {
        return { ...acc, ...value };
      }, {});

      const vaults: TVault[] = Object.values(mixedVaults).sort(
        (a: TVault, b: TVault) => Number(b.tvl) - Number(a.tvl)
      );

      initFilters(vaults);
      setLocalVaults(vaults);

      setFilteredVaults(vaults);
      setIsLocalVaultsLoaded(true);
      /////***** AFTER PAGE LOADING *****/ /////
      // if (!upgradesTable.length) {
      //   fetchPlatformUpdates();
      // }
    }
  };

  // useEffect(() => {
  //   if ($assetsPrices) {
  //     const BTC_LOGO = getTokenData(WBTC[0])?.logoURI as string;
  //     const ETH_LOGO = getTokenData(WETH[0])?.logoURI as string;
  //     const MATIC_LOGO = getTokenData(WMATIC[0])?.logoURI as string;

  //     const BTC_PRICE = formatNumber(
  //       formatUnits($assetsPrices[WBTC[0]], 18),
  //       "formatWithoutDecimalPart"
  //     ) as string;

  //     const ETH_PRICE = formatNumber(
  //       formatUnits($assetsPrices[WETH[0]], 18),
  //       "formatWithoutDecimalPart"
  //     ) as string;

  //     const MATIC_PRICE = formatNumber(
  //       formatUnits($assetsPrices[WMATIC[0]], 18),
  //       "format"
  //     ) as string;

  //     setTokens([
  //       { logo: BTC_LOGO, price: BTC_PRICE },
  //       { logo: ETH_LOGO, price: ETH_PRICE },
  //       { logo: MATIC_LOGO, price: MATIC_PRICE },
  //     ]);
  //   }
  // }, [$assetsPrices]);

  useEffect(() => {
    tableHandler();
  }, [tableFilters, activeNetworks]);

  useEffect(() => {
    initVaults();
  }, [$vaults, $isVaultsLoaded]);

  const isLoading = useMemo(() => {
    return !$isVaultsLoaded || !isLocalVaultsLoaded;
  }, [$isVaultsLoaded, isLocalVaultsLoaded]);

  if ($error.state && $error.type === "API") {
    return (
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <ErrorMessage type="API" />
      </div>
    );
  }

  return (
    <>
      <div
        className={`${
          isLoading ? "pointer-events-none" : "pointer-events-auto"
        }`}
      >
        <Portfolio vaults={localVaults} />
        <div className="flex items-center gap-4">
          {activeNetworks.map((chain) => (
            <div
              className={`h-[48px] w-[44px] flex items-center justify-center border-[#3d404b] bg-button cursor-pointer rounded-md ${
                !chain.active && "opacity-20"
              }`}
              key={chain.name + chain.id}
              title={chain.name}
              onClick={() => activeNetworksHandler(chain.id)}
            >
              <img
                className="h-6 w-6 rounded-full"
                src={chain.logoURI}
                alt={chain.name}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-col lg:flex-row text-[14px]">
          <input
            type="text"
            className="mt-1 lg:mt-0 w-full bg-button outline-none pl-3 py-[3px] rounded-[4px] border-[2px] border-[#3d404b] focus:border-[#6376AF] transition-all duration-300 h-[30px]"
            placeholder="Search"
            ref={search}
            onChange={() => tableHandler()}
          />
          <Filters filters={tableFilters} setFilters={setTableFilters} />
        </div>
      </div>

      <ErrorMessage type="WEB3" />
      {!!platformUpdates?.newVersion &&
        platformUpdates?.newVersion != $platformVersions[$currentChainID] &&
        !!upgradesTable?.length && (
          <div className="p-3  mt-3 rounded-md bg-[#262830]">
            <h3 className="mb-2 text-[1.4rem] font-medium">
              Time-locked platform upgrade in progress
            </h3>
            <h2 className="w-full font-thin text-lg text-left text-gray-400 py-1">
              <em className="text-xl font-medium">Current version:</em> v
              {$platformVersions[$currentChainID]}
            </h2>
            <h2 className="w-full font-thin text-lg text-left text-gray-400 py-1 flex">
              <em className="text-xl font-medium mr-1">New version:</em>
              <a
                className="underline flex gap-1 items-center"
                target="_blank"
                href={`https://github.com/stabilitydao/stability-contracts/releases/tag/v${platformUpdates.newVersion}`}
              >
                <p>v{platformUpdates.newVersion}</p>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 15 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M7.49999 0.562544C5.73427 0.562782 4.02622 1.19122 2.68139 2.33543C1.33657 3.47964 0.442689 5.06499 0.15966 6.80789C-0.123368 8.55078 0.222916 10.3375 1.13657 11.8485C2.05022 13.3595 3.47164 14.4961 5.14655 15.055C5.51843 15.1241 5.6778 14.8957 5.6778 14.6991C5.6778 14.5025 5.6778 14.0563 5.6778 13.4347C3.61124 13.881 3.17562 12.436 3.17562 12.436C3.03029 11.9806 2.72444 11.5936 2.31499 11.3469C1.6403 10.89 2.36812 10.8954 2.36812 10.8954C2.60378 10.9286 2.82872 11.0154 3.02576 11.1489C3.22279 11.2824 3.38671 11.4591 3.50499 11.6657C3.71077 12.0347 4.0547 12.307 4.46115 12.4226C4.86761 12.5381 5.30332 12.4875 5.67249 12.2819C5.70249 11.905 5.86867 11.5519 6.13999 11.2885C4.49312 11.0972 2.75593 10.4597 2.75593 7.61223C2.74389 6.87268 3.01796 6.15705 3.52093 5.61473C3.29327 4.97415 3.31989 4.27066 3.5953 3.64911C3.5953 3.64911 4.21687 3.44723 5.64062 4.40879C6.85796 4.07674 8.14202 4.07674 9.35937 4.40879C10.7778 3.44723 11.3994 3.64911 11.3994 3.64911C11.6748 4.27066 11.7014 4.97415 11.4737 5.61473C11.9767 6.15705 12.2508 6.87268 12.2387 7.61223C12.2387 10.4704 10.5016 11.0972 8.84406 11.2832C9.02161 11.4631 9.15853 11.6791 9.24559 11.9164C9.33264 12.1538 9.36782 12.407 9.34874 12.6591C9.34874 13.6525 9.34874 14.4547 9.34874 14.6991C9.34874 14.9435 9.48155 15.1294 9.87999 15.055C11.5571 14.4954 12.98 13.3566 13.8935 11.8428C14.807 10.3291 15.1514 8.5394 14.8649 6.79474C14.5784 5.05007 13.6797 3.46454 12.33 2.32245C10.9804 1.18037 9.26801 0.556436 7.49999 0.562544Z"
                    fill="gray"
                  ></path>
                </svg>
              </a>
            </h2>
            {!!lockTime.start && (
              <h2 className="w-full font-thin text-lg text-left text-gray-400 py-1">
                <em className="text-xl font-medium">Timelock start:</em>{" "}
                {lockTime.start}
              </h2>
            )}
            {!!lockTime.end && (
              <h2 className="w-full font-thin text-lg text-left text-gray-400 py-1">
                <em className="text-xl font-medium">Timelock end:</em>{" "}
                {lockTime.end}
              </h2>
            )}
            <div className="overflow-x-auto">
              <table className="table table-auto w-full rounded-lg">
                <thead className="bg-[#0b0e11]">
                  <tr className="text-[16px] text-[#8f8f8f] uppercase whitespace-nowrap">
                    <th className="text-left">Contract</th>
                    <th>Version</th>
                    <th>Proxy</th>
                    <th className="px-2">Old Implementation</th>
                    <th>New Implementation</th>
                  </tr>
                </thead>
                <tbody className="text-[14px]">
                  {!!upgradesTable.length &&
                    upgradesTable.map((upgrade) => (
                      <tr key={upgrade.contract} className="hover:bg-[#2B3139]">
                        <td className="text-left min-w-[100px]">
                          <p>{upgrade.contract}</p>
                        </td>
                        <td className="text-right min-w-[100px] px-2">
                          {upgrade.oldVersion} {"->"} {upgrade.newVersion}
                        </td>
                        {upgrade?.proxy && (
                          <td className="text-right min-w-[150px]">
                            <ShortAddress address={upgrade.proxy as TAddress} />
                          </td>
                        )}
                        {upgrade.oldImplementation && (
                          <td className="text-right min-w-[150px]">
                            <ShortAddress
                              address={upgrade?.oldImplementation as TAddress}
                            />
                          </td>
                        )}
                        {upgrade?.newImplementation && (
                          <td className="text-right min-w-[150px]">
                            <ShortAddress
                              address={upgrade.newImplementation as TAddress}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* <div className="flex items-center gap-5 p-2 flex-wrap">
        {!!tokens &&
          tokens.map((token) => (
            <div key={token.logo} className="flex items-center gap-2">
              <img
                src={token.logo}
                alt="logo"
                className="w-6 h-6 rounded-full"
              />
              <p className="text-[#848e9c] text-[18px]">${token.price}</p>
            </div>
          ))}
      </div> */}

      <div className="overflow-x-auto min-[1020px]:overflow-x-visible min-[1130px]:min-w-[1095px] min-[1440px]:min-w-[1338px]">
        <table className="table table-auto w-full rounded-lg select-none mb-9 min-w-[730px] md:min-w-full">
          <thead className="bg-[#0b0e11]">
            <tr className="text-[12px] text-[#8f8f8f] uppercase">
              {tableStates.map((value: any, index: number) => (
                <ColumnSort
                  key={value.name + index}
                  index={index}
                  value={value.name}
                  table={tableStates}
                  type="table"
                  sort={tableHandler}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr className="relative h-[80px]">
                <td className="absolute left-[50%] transform translate-x-[-50%] mt-5">
                  <Loader width="100" height="100" />
                </td>
              </tr>
            ) : localVaults?.length ? (
              <>
                {currentTabVaults?.length ? (
                  currentTabVaults.map((vault: TVault, index: number) => {
                    const network = CHAINS.find(
                      (chain) => chain.id === vault.network
                    );

                    return (
                      <tr
                        key={vault.name + index}
                        className="text-center text-[14px] min-[1020px]:hover:bg-[#2B3139] cursor-pointer h-[60px] font-medium relative"
                        onClick={() => toVault(vault.network, vault.address)}
                      >
                        <td className="mt-[6px] min-[1020px]:px-2 min-[1130px]:px-3 py-2 text-center w-[150px] min-[1020px]:w-[270px] min-[860px]:w-[250px] sticky min-[1020px]:relative left-0 min-[1020px]:block bg-[#181A20] min-[1020px]:bg-transparent z-10">
                          <div className="flex items-center">
                            {/* {vault?.risk?.isRektStrategy ? (
                                <div
                                  className="h-5 w-5 md:w-3 md:h-3 rounded-full mr-2 bg-[#EE6A63]"
                                  title={vault?.risk?.isRektStrategy as string}
                                ></div>
                              ) : (
                                <VaultState status={vault.status} />
                              )} */}
                            <div className="relative mr-[6px] hidden min-[1020px]:block">
                              <img
                                src={network?.logoURI}
                                alt={network?.name}
                                className="h-4 w-4 rounded-full absolute right-[-15%] top-[-15%]"
                              />
                              <img
                                src={`https://api.stabilitydao.org/vault/${vault.network}/${vault.address}/logo.svg`}
                                alt="logo"
                                className="w-8 h-8 rounded-full"
                              />
                            </div>

                            <div className="max-w-[150px] min-[1020px]:max-w-[250px] flex items-start flex-col text-[#eaecef]">
                              <p
                                title={vault.name}
                                className={`whitespace-nowrap text-[12px] md:text-[15px] ${
                                  vault?.risk?.isRektStrategy
                                    ? "text-[#818181]"
                                    : "text-[#fff]"
                                }`}
                              >
                                {vault.symbol}
                              </p>
                              <p className="min-[1130px]:hidden text-[#848e9c]">
                                {vault.strategyInfo.shortName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 min-[1130px]:px-1 py-2 table-cell">
                          <div className="flex items-center">
                            <div className="flex items-center w-[52px] justify-center">
                              {vault.assets.map((asset, index) => (
                                <img
                                  src={asset.logo}
                                  alt={asset.symbol}
                                  className={`w-6 h-6 rounded-full ${
                                    !index &&
                                    vault.assets.length > 1 &&
                                    "mr-[-10px] z-[5]"
                                  }`}
                                  key={asset.logo + index}
                                />
                              ))}
                            </div>
                            <span>{vault.assetsSymbol}</span>
                          </div>
                        </td>
                        {/* <td className="px-2 min-[1130px]:px-1 py-2 table-cell w-[50px]">
                          <div className="flex items-center justify-center">
                            {vault?.risk?.isRektStrategy ? (
                              <div
                                className="h-5 w-5 md:w-3 md:h-3 rounded-full mr-2 bg-[#EE6A63]"
                                title={vault?.risk?.isRektStrategy as string}
                              ></div>
                            ) : (
                              <VaultState status={vault.status} />
                            )}
                          </div>
                        </td>
                        <td className="px-2 min-[1130px]:px-1 py-2 hidden xl:table-cell w-[90px]">
                          <VaultType type={vault.type} />
                        </td> */}
                        <td className="pl-2 py-2 hidden min-[1340px]:table-cell whitespace-nowrap w-[220px]">
                          <div className="flex items-center border-0 rounded-[8px] pl-0 py-1 border-[#935ec2]">
                            {vault.strategyInfo && (
                              <>
                                <span
                                  style={{
                                    backgroundColor: vault.strategyInfo.bgColor,
                                    color: vault.strategyInfo.color,
                                  }}
                                  className="px-2 rounded-l-[10px] font-bold text-[#ffffff] text-[15px] flex h-8 items-center justify-center w-[58px]"
                                  title={vault.strategyInfo.name}
                                >
                                  {vault.strategyInfo.shortName}
                                </span>
                                <span
                                  className={`px-2 rounded-r-[10px] bg-[#1f1d40] hidden min-[1020px]:flex h-8 items-center ${
                                    (vault.strategySpecific &&
                                      vault.strategyInfo.shortName != "Y") ||
                                    vault.strategyInfo.protocols.length > 2
                                      ? "min-w-[100px] w-[170px]"
                                      : ""
                                  }`}
                                >
                                  <span
                                    className={`flex ${
                                      vault.yearnProtocols.length ||
                                      vault.strategyInfo.shortName === "CF"
                                        ? ""
                                        : "min-w-[50px]"
                                    }`}
                                  >
                                    {vault.strategyInfo.protocols.map(
                                      (protocol, index) => (
                                        <img
                                          className="h-6 w-6 rounded-full mx-[2px]"
                                          key={protocol.logoSrc + index}
                                          src={protocol.logoSrc}
                                          alt={protocol.name}
                                          title={protocol.name}
                                          style={{
                                            zIndex:
                                              vault.strategyInfo.protocols
                                                .length - index,
                                          }}
                                        />
                                      )
                                    )}
                                  </span>
                                  {/* <span className="flex">
                      {vault.strategyInfo.features.map(
                        (feature, i) => (
                          <img
                            key={i}
                            title={feature.name}
                            alt={feature.name}
                            className="w-6 h-6 ml-1"
                            src={`data:image/svg+xml;utf8,${encodeURIComponent(
                              feature.svg
                            )}`}
                          />
                        )
                      )}
                    </span> */}
                                  {vault.yearnProtocols.length ? (
                                    <div className="flex">
                                      {vault.yearnProtocols.map((protocol) => (
                                        <img
                                          key={protocol.link}
                                          src={protocol.link}
                                          alt={protocol.title}
                                          title={protocol.title}
                                          className="h-6 w-6 rounded-full mx-[2px]"
                                        />
                                      ))}
                                    </div>
                                  ) : vault.strategySpecific ? (
                                    <span
                                      className={`font-bold rounded-[4px] text-[#b6bdd7] hidden min-[1130px]:inline ${
                                        vault.strategySpecific.length > 10
                                          ? "lowercase  text-[9px] pl-[6px] whitespace-pre-wrap max-w-[70px] text-left"
                                          : "uppercase  text-[9px] px-[6px]"
                                      }`}
                                    >
                                      {vault.strategySpecific}
                                    </span>
                                  ) : (
                                    ""
                                  )}
                                </span>
                              </>
                            )}
                          </div>
                        </td>
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            setAprModal({
                              earningData: vault.earningData,
                              daily: vault.daily,
                              lastHardWork: vault.lastHardWork,
                              symbol: vault?.risk?.symbol as string,
                              state: true,
                              pool: vault?.pool,
                            });
                          }}
                          className="px-2 min-[1130px]:px-3 py-2 tooltip cursor-help w-[150px] min-[1020px]:w-[80px]"
                        >
                          <div
                            className={`text-[14px] whitespace-nowrap w-full text-end flex items-center justify-end gap-[2px] ${
                              vault?.risk?.isRektStrategy
                                ? "text-[#818181]"
                                : "text-[#eaecef]"
                            }`}
                          >
                            <p className="text-end">
                              {$hideFeeAPR
                                ? vault?.earningData?.apr.withoutFees[
                                    $aprFilter
                                  ]
                                : vault?.earningData?.apr.withFees[$aprFilter]}
                              %
                            </p>
                          </div>
                          <div className="visible__tooltip">
                            <div className="flex items-start flex-col gap-4">
                              <div className="text-[14px] flex flex-col gap-1 w-full">
                                {!!vault?.risk?.isRektStrategy && (
                                  <div className="flex flex-col items-center gap-2 mb-[10px]">
                                    <h3 className="text-[#f52a11] font-bold">
                                      {vault?.risk?.symbol} VAULT
                                    </h3>
                                    <p className="text-[12px] text-start">
                                      Rekt vault regularly incurs losses,
                                      potentially leading to rapid USD value
                                      decline, with returns insufficient to
                                      offset the losses.
                                    </p>
                                  </div>
                                )}
                                <div className="font-bold flex items-center justify-between">
                                  <p>Total APY</p>

                                  <p className="text-end">
                                    {$hideFeeAPR
                                      ? vault.earningData.apy.withoutFees[
                                          $aprFilter
                                        ]
                                      : vault.earningData.apy.withFees[
                                          $aprFilter
                                        ]}
                                    %
                                  </p>
                                </div>
                                <div className="font-bold flex items-center justify-between">
                                  <p>Total APR</p>
                                  <p className="text-end">
                                    {$hideFeeAPR
                                      ? vault.earningData.apr.withoutFees[
                                          $aprFilter
                                        ]
                                      : vault.earningData.apr.withFees[
                                          $aprFilter
                                        ]}
                                    %
                                  </p>
                                </div>

                                {vault?.earningData?.poolSwapFeesAPR.daily !=
                                  "-" &&
                                  vault?.pool && (
                                    <div className="font-bold flex items-center justify-between">
                                      <p>Pool swap fees APR</p>
                                      <p
                                        className={`${
                                          $hideFeeAPR && "line-through"
                                        } text-end`}
                                      >
                                        {
                                          vault.earningData.poolSwapFeesAPR[
                                            $aprFilter
                                          ]
                                        }
                                        %
                                      </p>
                                    </div>
                                  )}
                                <div className="font-bold flex items-center justify-between">
                                  <p>Strategy APR</p>
                                  <p className="text-end">
                                    {vault.earningData.farmAPR[$aprFilter]}%
                                  </p>
                                </div>
                                <div className="font-bold flex items-center justify-between">
                                  <p>Daily</p>
                                  <p className="text-end">
                                    {$hideFeeAPR
                                      ? (
                                          Number(
                                            vault.earningData.apr.withoutFees[
                                              $aprFilter
                                            ]
                                          ) / 365
                                        ).toFixed(2)
                                      : (
                                          Number(
                                            vault.earningData.apr.withFees[
                                              $aprFilter
                                            ]
                                          ) / 365
                                        ).toFixed(2)}
                                    %
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between w-full">
                                <p className="text-[16px]">Last Hard Work</p>
                                <TimeDifferenceIndicator
                                  unix={vault.lastHardWork}
                                />
                              </div>
                            </div>
                            <i></i>
                          </div>
                        </td>
                        <td
                          onClick={(e) => {
                            e.stopPropagation();
                            setVsHoldModal({
                              lifetimeTokensHold:
                                vault.lifetimeTokensHold as THoldData[],
                              vsHoldAPR: vault.vsHoldAPR,
                              lifetimeVsHoldAPR: vault.lifetimeVsHoldAPR,
                              created: getTimeDifference(vault.created)?.days,
                              state: true,
                              isVsActive: vault.isVsActive,
                            });
                          }}
                          className="px-2 min-[1130px]:px-3 py-2 w-[40px] tooltip cursor-help"
                        >
                          <p
                            className={`text-[14px] whitespace-nowrap w-full text-end flex items-center justify-end gap-[2px] ${
                              vault.lifetimeVsHoldAPR > 0
                                ? "text-[#b0ddb8]"
                                : "text-[#eb7979]"
                            }`}
                          >
                            {vault.lifetimeVsHoldAPR > 0 ? "+" : ""}
                            {vault.lifetimeVsHoldAPR}%
                          </p>
                          <div className="visible__tooltip !w-[450px]">
                            <table className="table table-auto w-full rounded-lg">
                              <thead className="bg-[#0b0e11]">
                                <tr className="text-[16px] text-[#8f8f8f] uppercase">
                                  <th></th>
                                  <th>
                                    {getTimeDifference(vault.created).days} days
                                  </th>
                                  <th className="text-right">est Annual</th>
                                </tr>
                              </thead>
                              <tbody className="text-[14px]">
                                <tr className="hover:bg-[#2B3139]">
                                  <td className="text-left">VAULT VS HODL</td>

                                  {vault.isVsActive ? (
                                    <td
                                      className={`text-right ${
                                        vault.vsHoldAPR > 0
                                          ? "text-[#b0ddb8]"
                                          : "text-[#eb7979]"
                                      }`}
                                    >
                                      {vault.vsHoldAPR > 0 ? "+" : ""}
                                      {vault.vsHoldAPR}%
                                    </td>
                                  ) : (
                                    <td className="text-right">-</td>
                                  )}

                                  {vault.isVsActive ? (
                                    <td
                                      className={`text-right ${
                                        vault.lifetimeVsHoldAPR > 0
                                          ? "text-[#b0ddb8]"
                                          : "text-[#eb7979]"
                                      }`}
                                    >
                                      {vault.lifetimeVsHoldAPR > 0 ? "+" : ""}
                                      {vault.lifetimeVsHoldAPR}%
                                    </td>
                                  ) : (
                                    <td className="text-right">-</td>
                                  )}
                                </tr>

                                {vault.lifetimeTokensHold.map(
                                  (aprsData: THoldData, index: number) => (
                                    <tr
                                      key={aprsData?.symbol + index}
                                      className="hover:bg-[#2B3139]"
                                    >
                                      <td className="text-left">
                                        VAULT VS {aprsData?.symbol} HODL
                                      </td>

                                      {vault.isVsActive ? (
                                        <td
                                          className={`text-right ${
                                            Number(aprsData.latestAPR) > 0
                                              ? "text-[#b0ddb8]"
                                              : "text-[#eb7979]"
                                          }`}
                                        >
                                          {Number(aprsData.latestAPR) > 0
                                            ? "+"
                                            : ""}
                                          {aprsData.latestAPR}%
                                        </td>
                                      ) : (
                                        <td className="text-right">-</td>
                                      )}

                                      {vault.isVsActive ? (
                                        <td
                                          className={`text-right ${
                                            Number(aprsData.latestAPR) > 0
                                              ? "text-[#b0ddb8]"
                                              : "text-[#eb7979]"
                                          }`}
                                        >
                                          {Number(aprsData.APR) > 0 ? "+" : ""}
                                          {aprsData.APR}%
                                        </td>
                                      ) : (
                                        <td className="text-right">-</td>
                                      )}
                                    </tr>
                                  )
                                )}
                              </tbody>
                            </table>
                            <i></i>
                          </div>
                        </td>
                        <td className="px-2 min-[1130px]:px-4 py-2 text-start w-[60px] min-[1020px]:w-[100px] whitespace-nowrap">
                          {vault?.risk?.isRektStrategy ? (
                            <span className="uppercase text-[#F52A11]">
                              {vault?.risk?.symbol}
                            </span>
                          ) : (
                            <span
                              className="uppercase"
                              style={{ color: vault.strategyInfo.il?.color }}
                            >
                              {vault.strategyInfo.il?.title}
                            </span>
                          )}
                        </td>
                        <td className="px-2 min-[1130px]:px-4 py-2 w-[90px]">
                          ${Number(vault.shareprice).toFixed(3)}
                        </td>
                        <td className="px-2 min-[1130px]:px-4 py-2 text-right w-[85px] text-[15px]">
                          {formatNumber(vault.tvl, "abbreviate")}
                        </td>
                        <td className="pr-2 md:pr-3 min-[1130px]:pr-5 py-2 text-right w-[110px] text-[15px]">
                          {formatNumber(
                            formatFromBigInt(vault.balance, 18),
                            "format"
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr className="text-start text-[14px] h-[60px] font-medium">
                    {userVaultsCondition ? (
                      <td>
                        <p className="text-[18px]">
                          You haven't connected your wallet.
                        </p>
                        <p>Connect to view your vaults.</p>
                        <button
                          className="bg-[#30127f] text-[#fcf3f6] py-0.5 px-4 rounded-md min-w-[120px] mt-2"
                          onClick={() => open()}
                        >
                          Connect Wallet
                        </button>
                      </td>
                    ) : (
                      <td>
                        <p className="text-[18px]">No results found.</p>
                        <p>
                          Try clearing your filters or changing your search
                          term.
                        </p>
                      </td>
                    )}
                  </tr>
                )}
              </>
            ) : (
              <tr className="text-start text-[14px] h-[60px] font-medium">
                <td>No vaults</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        vaults={filteredVaults}
        tab={currentTab}
        setTab={setCurrentTab}
      />
      {aprModal.state && (
        <APRModal state={aprModal} setModalState={setAprModal} />
      )}
      {vsHoldModal.state && (
        <VSHoldModal state={vsHoldModal} setModalState={setVsHoldModal} />
      )}
      {/* <a href="/create-vault">
        <button className="bg-button px-3 py-2 rounded-md text-[14px] mt-3">
          Create vault
        </button>
      </a> */}
    </>
  );
};

export { Vaults };
