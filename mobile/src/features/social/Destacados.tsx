import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Award } from 'lucide-react-native';
import { Texto } from '@/components/Texto';
import { Pulsable } from '@/components/Pulsable';
import { ir } from '@/features/mercado/componentes';
import { Avatar } from './componentes';
import { destacados } from './servicio';

const etiquetas: Record<string, string> = { ventas: 'Top ventas', publicaciones: 'Top publicaciones', seguidores: 'Top seguidores' };

export function Destacados() {
  const [perfiles, setPerfiles] = useState<Awaited<ReturnType<typeof destacados>>>([]);
  useEffect(() => { let activo = true; destacados().then(p => { if (activo) setPerfiles(p); }).catch(() => {}); return () => { activo = false; }; }, []);
  if (!perfiles.length) return null;
  const agrupados = [...new Set(perfiles.map(p => p.id))].map(id => perfiles.filter(p => p.id === id));
  return <View style={s.raiz}>
    <View style={s.titulo}><Award size={14} color="#286444" /><Texto style={s.encabezado}>Destacados de la comunidad</Texto></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fila}>
      {agrupados.map(grupo => { const p = grupo[0]; return <Pulsable key={p.id} style={s.tarjeta} accessibilityRole="link"
        accessibilityLabel={`${p.alias}. ${grupo.map(g => `${etiquetas[g.category]}: ${g.count}`).join('. ')}`}
        onPress={() => ir(`/perfil/${p.id}`)}>
        <Avatar alias={p.alias} url={p.avatarUrl} tamano={38} />
        <View style={{ flex: 1, gap: 2 }}><Texto numberOfLines={1} style={s.nombre}>{p.alias}</Texto>
          {grupo.map(g => <Texto key={g.category} style={s.insignia}>{etiquetas[g.category]} · {g.count}</Texto>)}
        </View>
      </Pulsable>; })}
    </ScrollView>
  </View>;
}
const s = StyleSheet.create({
  raiz: { gap: 5, marginVertical: 3 }, titulo: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  encabezado: { fontSize: 11, fontWeight: '700', color: '#286444' }, fila: { gap: 8 },
  tarjeta: { width: 186, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 18, backgroundColor: '#ffffffd9', borderWidth: 1, borderColor: '#d9e8d8' },
  nombre: { fontSize: 12, fontWeight: '700', color: '#173e2b' }, insignia: { fontSize: 10, color: '#347648', fontWeight: '600' },
});
