import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";

interface CountryEntry {
  country_code: string;
  peer_count: number;
  download_bytes: number;
  upload_bytes: number;
  last_seen: number;
}

interface CountryResponse {
  total_peers: number;
  countries: CountryEntry[];
}

export function CountryTable() {
  const data = useSignal<CountryResponse | null>(null);
  const loading = useSignal(true);

  const fetchData = async () => {
    loading.value = true;
    try {
      const resp = await fetch("http://127.0.0.1:8080/api/v2/peers/countries", {
        credentials: "include",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data.value = await resp.json();
    } catch {
      data.value = { total_peers: 0, countries: [] };
    } finally {
      loading.value = false;
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15_000);
    return () => clearInterval(interval);
  }, []);

  // Country code → emoji flag (basic)
  const flag = (cc: string): string => {
    if (cc.length !== 2) return "🌍";
    return [...cc.toUpperCase()].map((c) =>
      String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)
    ).join("");
  };

  if (loading.value && !data.value) {
    return <div class="ct-loading">Loading country data...</div>;
  }

  const countries = data.value?.countries ?? [];
  const totalPeers = data.value?.total_peers ?? 0;
  const maxCount = Math.max(1, ...countries.map((c) => c.peer_count));

  return (
    <div class="ct-container">
      <div class="ct-header">
        <span class="ct-title">🌍 P2P Traffic by Country</span>
        <span class="ct-total">{totalPeers} total peers</span>
      </div>

      {countries.length === 0 ? (
        <div class="ct-empty">
          <span>No peer connection data yet</span>
          <span class="ct-hint">Country data requires active torrents with peers</span>
        </div>
      ) : (
        <div class="ct-table">
          <div class="ct-row ct-row-header">
            <span class="ct-cell-flag"></span>
            <span class="ct-cell-code">Code</span>
            <span class="ct-cell-country">Country</span>
            <span class="ct-cell-count">Peers</span>
            <span class="ct-cell-bar">Share</span>
          </div>
          {countries.map((c) => {
            const pct = (c.peer_count / maxCount) * 100;
            const sharePct = totalPeers > 0 ? ((c.peer_count / totalPeers) * 100).toFixed(1) : "0";
            return (
              <div key={c.country_code} class="ct-row">
                <span class="ct-cell-flag">{flag(c.country_code)}</span>
                <span class="ct-cell-code">{c.country_code}</span>
                <span class="ct-cell-country">{countryName(c.country_code)}</span>
                <span class="ct-cell-count">{c.peer_count}</span>
                <span class="ct-cell-bar">
                  <div class="ct-bar-wrap">
                    <div class="ct-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span class="ct-bar-label">{sharePct}%</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div class="ct-footer-hint">
        Country data uses MaxMind GeoLite2 if available, otherwise estimated from IP ranges.
      </div>
    </div>
  );
}

function countryName(code: string): string {
  const names: Record<string, string> = {
    US: "United States", RU: "Russia", CN: "China", DE: "Germany",
    GB: "United Kingdom", FR: "France", JP: "Japan", BR: "Brazil",
    IN: "India", CA: "Canada", AU: "Australia", NL: "Netherlands",
    KR: "South Korea", SE: "Sweden", NO: "Norway", FI: "Finland",
    DK: "Denmark", IT: "Italy", ES: "Spain", PL: "Poland",
    UA: "Ukraine", SG: "Singapore", HK: "Hong Kong", TW: "Taiwan",
    CH: "Switzerland", AT: "Austria", BE: "Belgium", IE: "Ireland",
    NZ: "New Zealand", AR: "Argentina", MX: "Mexico", ID: "Indonesia",
    TH: "Thailand", VN: "Vietnam", MY: "Malaysia", PH: "Philippines",
    TR: "Turkey", IL: "Israel", ZA: "South Africa", EG: "Egypt",
    AS: "Asia (other)", "Unknown": "Unknown",
  };
  return names[code] ?? code;
}
