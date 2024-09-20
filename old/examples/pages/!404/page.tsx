import { PageLikeProps } from "parcel/cargo/tasks/parcel.ts";

export default ({ params }: PageLikeProps) => {
  return (
    <h1>
      404 {params.whatever}
    </h1>
  );
};
