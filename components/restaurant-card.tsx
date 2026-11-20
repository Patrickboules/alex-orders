import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { RestaurantCardView } from "@/components/view-types";

/** Cover image, or the restaurant's first letter set large on a quiet wash. */
export function RestaurantCover({ name, url, className = "" }: { name: string; url?: string | null; className?: string }) {
  if (url) {
    return (
      <div className={`relative overflow-hidden bg-wash ${className}`}>
        <Image
          src={url}
          alt=""
          fill
          unoptimized
          sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      </div>
    );
  }
  const initial = Array.from(name.trim())[0] ?? "·";
  return (
    <div aria-hidden="true" className={`grid place-items-center bg-wash text-ink-3 ${className}`}>
      <span className="text-[3.5rem] leading-none font-semibold" dir="auto">
        {initial}
      </span>
    </div>
  );
}

export function RestaurantCard({
  restaurant,
  href,
  meta,
}: {
  restaurant: RestaurantCardView;
  href: string;
  meta?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-[var(--radius-box)] border border-line bg-paper transition-colors duration-150 hover:border-line-strong"
    >
      <RestaurantCover name={restaurant.name} url={restaurant.coverImageUrl} className="aspect-[16/10] border-b border-line" />
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold group-hover:underline group-hover:underline-offset-4" dir="auto">
            {restaurant.name}
          </h3>
          <p className="mt-0.5 text-sm text-ink-2">
            {meta ?? `${restaurant.itemCount} ${restaurant.itemCount === 1 ? "item" : "items"}`}
          </p>
        </div>
        {restaurant.openOrderShortCode ? (
          <Badge tone="open" dot className="mt-0.5">
            Order open
          </Badge>
        ) : null}
      </div>
    </Link>
  );
}
