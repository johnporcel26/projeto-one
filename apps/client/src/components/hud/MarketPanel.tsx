import { useMemo, useState } from "react";
import {
  Clock3,
  Coins,
  Gem,
  PackagePlus,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from "lucide-react";
import { itemDefinitions, type Currency, type ItemId } from "@onepiece/shared";
import { useGameUi } from "../../ui/GameUiStore";
import "./market.css";

const root = "/";
const icons: Record<ItemId, string> = {
  item_red_scarf: `${root}Itens/Lencovermelho/1.png`,
  item_gold_ring: `${root}Itens/Anel de Ouro/1.png`,
  item_gravel: `${root}Itens/Cascalho/1.png`,
  item_potion_small: `${root}Itens/Poção Menor/1.png`,
  item_potion_large: `${root}Itens/Poção Maior/1.png`,
  item_soap: `${root}Itens/Sabonete/1.png`,
  fruit_sube_sube: `${root}Akumanomi/Sube/SubeSube.png`,
  fruit_mogu_mogu: `${root}Akumanomi/Mogu/1.png`,
  fruit_hito_hito: `${root}Akumanomi/Hito/1.png`,
  fruit_guro_guro: `${root}Akumanomi/Guro/598d5176-ae03-4186-947c-581ce2a5d5c9.png`,
};
type Tab = "browse" | "sell" | "mine" | "offers" | "received";
type CurrencyFilter = "ALL" | Currency;
const money = (value: number) => value.toLocaleString("pt-BR");
const remaining = (expiresAt: number) => {
  const ms = Math.max(0, expiresAt - Date.now());
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor(ms / 60_000) % 60}min`;
};

export function PremiumMarketPanel({
  onIntent,
}: {
  onIntent: (intent: unknown) => void;
}): JSX.Element {
  const { snapshot } = useGameUi(),
    player = snapshot?.player,
    market = snapshot?.auction;
  const [tab, setTab] = useState<Tab>("browse"),
    [query, setQuery] = useState(""),
    [currency, setCurrency] = useState<CurrencyFilter>("ALL"),
    [mode, setMode] = useState<"ALL" | "FIXED" | "OFFERS">("ALL"),
    [sort, setSort] = useState<"RECENT" | "LOW" | "HIGH" | "ENDING">("RECENT");
  const [itemId, setItemId] = useState<ItemId>("item_gravel"),
    [quantity, setQuantity] = useState(1),
    [berries, setBerries] = useState(""),
    [rubies, setRubies] = useState(""),
    [acceptOffers, setAcceptOffers] = useState(true);
  const listings = useMemo(
    () =>
      [...(market?.listings ?? [])]
        .filter((x) =>
          itemDefinitions[x.itemId].displayName
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .filter(
          (x) =>
            currency === "ALL" ||
            (currency === "BERRIES" && x.berriesPrice) ||
            (currency === "RUBIES" && x.rubiesPrice),
        )
        .filter(
          (x) =>
            mode === "ALL" ||
            (mode === "OFFERS" && x.allowOffers) ||
            (mode === "FIXED" && !x.allowOffers),
        )
        .sort((a, b) =>
          sort === "ENDING"
            ? a.expiresAt - b.expiresAt
            : sort === "LOW"
              ? (a.berriesPrice ?? a.rubiesPrice ?? Infinity) -
                (b.berriesPrice ?? b.rubiesPrice ?? Infinity)
              : sort === "HIGH"
                ? (b.berriesPrice ?? b.rubiesPrice ?? 0) -
                  (a.berriesPrice ?? a.rubiesPrice ?? 0)
                : b.createdAt - a.createdAt,
        ),
    [market?.listings, query, currency, mode, sort],
  );
  const offer = (listingId: string) => {
    const amount = Number(window.prompt("Valor da oferta (inteiro):", ""));
    if (!Number.isInteger(amount) || amount < 1) return;
    onIntent({
      type: "createAuctionOffer",
      listingId,
      currency: window.confirm("Usar Rubis? Cancelar utiliza Berries.")
        ? "RUBIES"
        : "BERRIES",
      amount,
    });
  };
  const tabs: readonly [Tab, string, number][] = [
    ["browse", "Procurar", listings.length],
    ["sell", "Anunciar", 0],
    ["mine", "Meus anúncios", market?.myListings.length ?? 0],
    ["offers", "Minhas ofertas", market?.myOffers.length ?? 0],
    [
      "received",
      "Recebidas",
      market?.receivedOffers.filter((x) => x.status === "ACTIVE").length ?? 0,
    ],
  ];
  return (
    <section className="premium-market">
      <header className="market-hero">
        <div>
          <span className="market-kicker">MERCADO PIRATA</span>
          <h3>Mercado</h3>
          <p>Negocie com segurança pelo mar de Alvida.</p>
        </div>
        <div className="market-wallet">
          <div>
            <Coins />
            <span>BERRIES</span>
            <b>{money(player?.wallet.berries ?? 0)}</b>
          </div>
          <div>
            <Gem />
            <span>RUBIS</span>
            <b>{money(player?.wallet.rubies ?? 0)}</b>
          </div>
        </div>
        <div className="market-rules">
          <span>
            <Tag /> Taxa: <b>10%</b>
          </span>
          <span>
            <Clock3 /> Expira: <b>48h</b>
          </span>
        </div>
      </header>
      <nav className="market-premium-tabs">
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {count > 0 && <b>{count}</b>}
          </button>
        ))}
      </nav>
      <div className="market-layout">
        <aside className="market-sidebar">
          {tab === "browse" ? (
            <>
              <h4>
                <SlidersHorizontal /> FILTROS
              </h4>
              <label className="market-search">
                <Search />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar item..."
                />
                <button onClick={() => setQuery("")}>
                  <X />
                </button>
              </label>
              <Filter
                title="MOEDA"
                values={[
                  ["ALL", "Tudo"],
                  ["BERRIES", "Berries"],
                  ["RUBIES", "Rubis"],
                ]}
                selected={currency}
                set={setCurrency}
              />
              <Filter
                title="TIPO DE ANÚNCIO"
                values={[
                  ["ALL", "Todos"],
                  ["FIXED", "Preço fixo"],
                  ["OFFERS", "Aceita ofertas"],
                ]}
                selected={mode}
                set={setMode}
              />
              <label className="market-sort">
                ORDENAR POR
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as typeof sort)}
                >
                  <option value="RECENT">Mais recentes</option>
                  <option value="LOW">Menor preço</option>
                  <option value="HIGH">Maior preço</option>
                  <option value="ENDING">Terminando primeiro</option>
                </select>
              </label>
            </>
          ) : (
            <Help tab={tab} />
          )}
        </aside>
        <main className="market-content">
          {tab === "browse" ? (
            <>
              <header className="market-content-header">
                <div>
                  <span className="market-kicker">ANÚNCIOS ATIVOS</span>
                  <h4>{listings.length} resultados encontrados</h4>
                </div>
                <small>Escrow processado pelo servidor.</small>
              </header>
              <div className="market-cards">
                {listings.map((x) => (
                  <Listing
                    key={x.id}
                    listing={x}
                    buy={(currency) =>
                      onIntent({
                        type: "buyAuctionListing",
                        listingId: x.id,
                        currency,
                      })
                    }
                    offer={() => offer(x.id)}
                  />
                ))}
                {!listings.length && (
                  <Empty text="Nenhum anúncio corresponde aos filtros." />
                )}
              </div>
            </>
          ) : tab === "sell" ? (
            <Sell
              inventory={player?.inventory ?? []}
              itemId={itemId}
              setItemId={setItemId}
              quantity={quantity}
              setQuantity={setQuantity}
              berries={berries}
              setBerries={setBerries}
              rubies={rubies}
              setRubies={setRubies}
              offers={acceptOffers}
              setOffers={setAcceptOffers}
              submit={() =>
                onIntent({
                  type: "createAuctionListing",
                  itemId,
                  quantity,
                  berriesPrice: berries ? Number(berries) : undefined,
                  rubiesPrice: rubies ? Number(rubies) : undefined,
                  allowOffers: acceptOffers,
                })
              }
            />
          ) : tab === "mine" ? (
            <Listings
              entries={market?.myListings ?? []}
              empty="Você não possui anúncios."
              action={(x) =>
                onIntent({ type: "cancelAuctionListing", listingId: x.id })
              }
            />
          ) : (
            <Offers
              entries={
                tab === "offers"
                  ? (market?.myOffers ?? [])
                  : (market?.receivedOffers ?? [])
              }
              empty={
                tab === "offers"
                  ? "Você ainda não enviou ofertas."
                  : "Nenhuma oferta recebida."
              }
              accept={
                tab === "received"
                  ? (x) =>
                      onIntent({
                        type: "acceptAuctionOffer",
                        listingId: x.listingId,
                        offerId: x.id,
                      })
                  : undefined
              }
              reject={
                tab === "received"
                  ? (x) =>
                      onIntent({
                        type: "rejectAuctionOffer",
                        listingId: x.listingId,
                        offerId: x.id,
                      })
                  : undefined
              }
            />
          )}
        </main>
      </div>
    </section>
  );
}
function Filter<T extends string>({
  title,
  values,
  selected,
  set,
}: {
  title: string;
  values: readonly (readonly [T, string])[];
  selected: T;
  set: (x: T) => void;
}): JSX.Element {
  return (
    <section className="market-filter">
      <span>{title}</span>
      <div>
        {values.map(([value, label]) => (
          <button
            key={value}
            onClick={() => set(value)}
            className={selected === value ? "selected" : ""}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
function Help({ tab }: { tab: Exclude<Tab, "browse"> }): JSX.Element {
  const text: Record<Exclude<Tab, "browse">, string> = {
    sell: "Escolha o item, defina o preço e confirme. O item fica guardado em escrow.",
    mine: "Cancele um anúncio ativo para receber o item de volta.",
    offers: "Seu saldo fica reservado até a decisão do vendedor.",
    received: "Aceite para concluir ou recuse para liberar o saldo.",
  };
  return (
    <div className="market-help">
      <PackagePlus />
      <span>GUIA DO MERCADO</span>
      <p>{text[tab]}</p>
    </div>
  );
}
function Listing({
  listing,
  buy,
  offer,
}: {
  listing: NonNullable<
    ReturnType<typeof useGameUi>["snapshot"]
  >["auction"]["listings"][number];
  buy: (x: Currency) => void;
  offer: () => void;
}): JSX.Element {
  const item = itemDefinitions[listing.itemId];
  return (
    <article className="market-card">
      <img src={icons[listing.itemId]} alt="" />
      <div className="market-card-copy">
        <div>
          <span className="item-category">{item.category}</span>
          {listing.allowOffers && (
            <span className="offer-badge">ACEITA OFERTAS</span>
          )}
        </div>
        <h5>
          {item.displayName} <b>×{listing.quantity}</b>
        </h5>
        <p>
          Vendedor: <strong>Capitão {listing.sellerId.slice(0, 5)}</strong> ·{" "}
          <Clock3 /> {remaining(listing.expiresAt)}
        </p>
      </div>
      <div className="market-prices">
        {listing.berriesPrice && (
          <b>
            <Coins /> {money(listing.berriesPrice)}
          </b>
        )}
        {listing.rubiesPrice && (
          <b className="ruby">
            <Gem /> {money(listing.rubiesPrice)}
          </b>
        )}
      </div>
      <div className="market-card-actions">
        {listing.berriesPrice && (
          <button className="market-primary" onClick={() => buy("BERRIES")}>
            COMPRAR
          </button>
        )}
        {listing.rubiesPrice && (
          <button className="market-secondary" onClick={() => buy("RUBIES")}>
            COMPRAR
          </button>
        )}
        {listing.allowOffers && (
          <button className="market-ghost" onClick={offer}>
            OFERTAR
          </button>
        )}
      </div>
    </article>
  );
}
function Sell({
  inventory,
  itemId,
  setItemId,
  quantity,
  setQuantity,
  berries,
  setBerries,
  rubies,
  setRubies,
  offers,
  setOffers,
  submit,
}: {
  inventory: readonly { itemId: ItemId; quantity: number }[];
  itemId: ItemId;
  setItemId: (x: ItemId) => void;
  quantity: number;
  setQuantity: (x: number) => void;
  berries: string;
  setBerries: (x: string) => void;
  rubies: string;
  setRubies: (x: string) => void;
  offers: boolean;
  setOffers: (x: boolean) => void;
  submit: () => void;
}): JSX.Element {
  const items = inventory.filter(
      (x) => itemDefinitions[x.itemId].tradeable && x.quantity > 0,
    ),
    net = (x: string) => (x ? Math.floor(Number(x) * 0.9) : 0);
  return (
    <div className="market-sell-flow">
      <header>
        <span className="market-kicker">CRIAR NOVO ANÚNCIO</span>
        <h4>Venda com segurança e veja o valor líquido antes de publicar.</h4>
      </header>
      <section>
        <b>
          <i>1</i> O QUE VOCÊ VAI ANUNCIAR
        </b>
        <div className="sell-items">
          {items.map((x) => (
            <button
              key={x.itemId}
              className={itemId === x.itemId ? "selected" : ""}
              onClick={() => setItemId(x.itemId)}
            >
              <img src={icons[x.itemId]} alt="" />
              <span>
                {itemDefinitions[x.itemId].displayName}
                <small>Disponível: ×{x.quantity}</small>
              </span>
            </button>
          ))}
        </div>
        <label className="market-field">
          Quantidade
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
      </section>
      <section>
        <b>
          <i>2</i> COMO VENDER
        </b>
        <div className="market-sale-modes">
          <button
            className={berries || rubies ? "selected" : ""}
            onClick={() => !berries && !rubies && setBerries("1")}
          >
            PREÇO FIXO<small>Venda direta por Berries ou Rubis</small>
          </button>
          <button
            className={offers ? "selected" : ""}
            onClick={() => setOffers(!offers)}
          >
            RECEBER OFERTAS
            <small>Compradores podem reservar uma proposta</small>
          </button>
        </div>
      </section>
      <section className="market-values">
        <b>
          <i>3</i> VALORES
        </b>
        <label className="market-field">
          Preço em Berries
          <input
            type="number"
            min="1"
            value={berries}
            onChange={(e) => setBerries(e.target.value)}
            placeholder="Opcional"
          />
        </label>
        <label className="market-field">
          Preço em Rubis
          <input
            type="number"
            min="1"
            value={rubies}
            onChange={(e) => setRubies(e.target.value)}
            placeholder="Opcional"
          />
        </label>
      </section>
      <footer>
        <div>
          <span>Cadastro grátis · Expira em 48h</span>
          <p>
            Berries líquido: <b>{money(net(berries))}</b> · Rubis líquido:{" "}
            <b>{money(net(rubies))}</b>
          </p>
        </div>
        <button className="market-primary" onClick={submit}>
          CRIAR ANÚNCIO
        </button>
      </footer>
    </div>
  );
}
function Listings({
  entries,
  empty,
  action,
}: {
  entries: readonly NonNullable<
    ReturnType<typeof useGameUi>["snapshot"]
  >["auction"]["myListings"][number][];
  empty: string;
  action: (
    x: NonNullable<
      ReturnType<typeof useGameUi>["snapshot"]
    >["auction"]["myListings"][number],
  ) => void;
}): JSX.Element {
  return (
    <div className="market-cards">
      {entries.map((x) => (
        <article className="market-card mine" key={x.id}>
          <img src={icons[x.itemId]} alt="" />
          <div className="market-card-copy">
            <span className="item-category">{x.status}</span>
            <h5>
              {itemDefinitions[x.itemId].displayName} ×{x.quantity}
            </h5>
            <p>
              <Clock3 /> {remaining(x.expiresAt)} ·{" "}
              {x.allowOffers ? "aceita ofertas" : "preço fixo"}
            </p>
          </div>
          <div className="market-prices">
            {x.berriesPrice && (
              <b>
                <Coins /> {money(x.berriesPrice)}
              </b>
            )}
            {x.rubiesPrice && (
              <b className="ruby">
                <Gem /> {money(x.rubiesPrice)}
              </b>
            )}
          </div>
          <button
            className="market-danger"
            disabled={x.status !== "ACTIVE"}
            onClick={() => action(x)}
          >
            CANCELAR
          </button>
        </article>
      ))}
      {!entries.length && <Empty text={empty} />}
    </div>
  );
}
function Offers({
  entries,
  empty,
  accept,
  reject,
}: {
  entries: readonly NonNullable<
    ReturnType<typeof useGameUi>["snapshot"]
  >["auction"]["myOffers"][number][];
  empty: string;
  accept?: (
    x: NonNullable<
      ReturnType<typeof useGameUi>["snapshot"]
    >["auction"]["myOffers"][number],
  ) => void;
  reject?: (
    x: NonNullable<
      ReturnType<typeof useGameUi>["snapshot"]
    >["auction"]["myOffers"][number],
  ) => void;
}): JSX.Element {
  return (
    <div className="market-cards">
      {entries.map((x) => (
        <article className="market-card offer" key={x.id}>
          <Gem />
          <div className="market-card-copy">
            <span className="item-category">{x.status}</span>
            <h5>Oferta em {x.currency === "BERRIES" ? "Berries" : "Rubis"}</h5>
            <p>
              Saldo{" "}
              {x.status === "ACTIVE" ? "reservado em escrow" : "processado"}
            </p>
          </div>
          <div className="market-prices">
            <b className={x.currency === "RUBIES" ? "ruby" : ""}>
              {x.currency === "BERRIES" ? <Coins /> : <Gem />}
              {money(x.amount)}
            </b>
          </div>
          {accept && reject && x.status === "ACTIVE" && (
            <div className="market-card-actions">
              <button className="market-primary" onClick={() => accept(x)}>
                ACEITAR
              </button>
              <button className="market-danger" onClick={() => reject(x)}>
                RECUSAR
              </button>
            </div>
          )}
        </article>
      ))}
      {!entries.length && <Empty text={empty} />}
    </div>
  );
}
function Empty({ text }: { text: string }): JSX.Element {
  return (
    <div className="market-empty">
      <Search />
      <p>{text}</p>
    </div>
  );
}
