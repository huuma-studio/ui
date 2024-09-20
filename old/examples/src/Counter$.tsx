import { $, onMount } from "parcel/hooks/mod.ts";

export default function () {
  const count$ = $(0);

  const loop = (count: number) => {
    const a: JSX.Element[] = [];
    for (let i = 0; i < count; i++) {
      a.push(<Nested />);
    }
    return a;
  };

  return (
    <div>
      {loop(count$.get)}
      <button
        on-click={() => {
          count$.set(count$.get - 1);
        }}
      >
        -
      </button>
      <span>
        {"Count: "} {count$.get}
      </span>
      <button
        on-click={() => {
          count$.set(count$.get + 1);
        }}
      >
        +
      </button>
      {loop(count$.get)}
    </div>
  );
}

function Nested() {
  const count$ = $("1");

  return (
    <div
      on-click={() => {
        count$.set(count$.get + "1");
      }}
    >
      {count$.get}
      {" World"}
    </div>
  );
}
