import type { Metadata } from "next";
import { MapExplorer } from "./MapExplorer";

export const metadata: Metadata = {
  title: "Join Scout Night School Map",
  description:
    "Explore Fall Recruitment schools, Join Scout Night details, and council geography across the Capitol Area Council.",
};

export default function Home() {
  return <MapExplorer />;
}
