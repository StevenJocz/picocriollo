import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Pulsable } from '@/components/Pulsable';
import { Texto } from '@/components/Texto';
import { color } from '@/theme/tokens';

export function Galeria({ fotos }: { fotos: string[] }) {
  const [indice, setIndice] = useState(0);
  const actual = Math.min(indice, fotos.length - 1);
  if (!fotos.length) return null;
  return <View style={{ gap: 8 }}>
    <Image source={{ uri: fotos[actual] }} resizeMode="contain" accessibilityLabel={`Foto ${actual + 1} de ${fotos.length}`} style={{ width: '100%', height: 300, borderRadius: 24 }} />
    {fotos.length > 1 && <>
      <Texto variante="pequeno">{actual + 1} / {fotos.length} · Toca una foto para verla</Texto>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {fotos.map((uri, i) => <Pulsable key={uri} accessibilityRole="button" accessibilityLabel={`Ver foto ${i + 1}`} onPress={() => setIndice(i)} style={{ borderWidth: 2, borderColor: i === actual ? color.green : 'transparent', borderRadius: 14, padding: 2 }}>
          <Image resizeMode="contain" source={{ uri }} style={{ width: 72, height: 72, borderRadius: 10 }} />
        </Pulsable>)}
      </ScrollView>
    </>}
  </View>;
}
