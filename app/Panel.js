"use client";

export default function Panel({ profile, market }) {
  return (
    <div className="panel">
      <div className="cols">
        <div>
          <h3>What you sell</h3>
          <p>{profile.business_summary}</p>
        </div>
        {market && (
          <div>
            <h3>Your market</h3>
            {market.competitors && market.competitors.length > 0 && (
              <ul>
                {market.competitors.map((c) => (
                  <li key={c.url || c.name}>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.name}
                    </a>
                    {c.note ? `: ${c.note}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {market.differentiators && market.differentiators.length > 0 && (
              <>
                <p>How you could stand out:</p>
                <ul>
                  {market.differentiators.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
            {market.positioning && <p>{market.positioning}</p>}
            <p className="fine">Based on web search results. Check it before relying on it.</p>
          </div>
        )}
      </div>
    </div>
  );
              }
