import NaturistMapChannel from "@/components/channels/NaturistMapChannel";

export default function NaturistMapPage() {
  return (
    <section className="p-4 sm:p-6">
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">Naturist Map</h1>
      <NaturistMapChannel />
    </section>
  );
}