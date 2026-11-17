'use client';
import Image from 'next/image';
import { useState } from 'react';

// Galería del detalle: foto grande y miniaturas. Con una sola foto no hay miniaturas.
export function PhotoGallery({ urls, alt, fallback }: { urls: string[]; alt: string; fallback: string }) {
  const [active, setActive] = useState(0);
  if (!urls.length) return <div className="market-detail-photo"><span className="market-thumb-fallback" aria-hidden="true">{fallback}</span></div>;
  const current = urls[Math.min(active, urls.length - 1)];
  return (
    <div className="photo-gallery">
      <div className="market-detail-photo"><Image src={current} alt={alt} width={420} height={420} unoptimized className="market-thumb-img" /></div>
      {urls.length > 1 && (
        <div className="photo-gallery-thumbs">
          {urls.map((url, index) => (
            <button key={url} type="button" className={index === active ? 'photo-thumb-active' : ''} aria-label={`Ver foto ${index + 1} de ${urls.length}`} aria-current={index === active} onClick={() => setActive(index)}>
              <Image src={url} alt="" width={64} height={64} unoptimized />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
