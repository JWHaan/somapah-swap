"use client";

import { useState } from "react";

export function SimulatedReserve() {
  const [reserved, setReserved] = useState(false);

  return (
    <section className="panel reserve-panel" aria-labelledby="reserve-heading">
      <h2 id="reserve-heading">Interested in this item?</h2>
      <button
        className="reserve-button"
        onClick={() => setReserved(true)}
        type="button"
      >
        Reserve (simulated)
      </button>
      {reserved ? (
        <p className="reserve-status" role="status">
          The reservation is simulated. No seller was contacted and no payment
          was taken.
        </p>
      ) : null}
    </section>
  );
}
