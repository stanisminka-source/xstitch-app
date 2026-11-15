export function Logo({ size }: { size: number }) {
  return <img class="logo" src={`${import.meta.env.BASE_URL}icons/favicon.svg`} alt="" width={size} height={size} />;
}
