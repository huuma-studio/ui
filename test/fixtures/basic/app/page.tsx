import Counter from "./counter.client.tsx";

export default function Home() {
  return (
    <>
      <h1>Home</h1>
      <Counter start={1} />
    </>
  );
}
