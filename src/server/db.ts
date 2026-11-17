import { Pool } from 'pg';

// Next puede incluir este módulo en varios paquetes de rutas; globalThis evita crear
// un pool independiente por paquete dentro del mismo proceso.
type PoolGlobal = typeof globalThis & { __picoCriolloPgPool?: Pool };
const poolGlobal = globalThis as PoolGlobal;

// El esquema lo crea PgStore (src/server/storage/pg-driver.ts).
function getPool(){
  if(poolGlobal.__picoCriolloPgPool)return poolGlobal.__picoCriolloPgPool;
  const password=process.env.PGPASSWORD;
  if(!password||!process.env.PGDATABASE||!process.env.PGUSER)throw new Error('Faltan PGPASSWORD, PGDATABASE o PGUSER para conectar PostgreSQL.');
  // Los tiempos límite evitan que una consulta o transacción colgada retenga una conexión para siempre
  // (con max_connections lleno, Postgres rechaza a todos los clientes: "too many clients already").
  const created=new Pool({host:process.env.PGHOST||'postgres',port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,user:process.env.PGUSER,password,max:Number(process.env.PGPOOL_MAX||5),idleTimeoutMillis:30_000,connectionTimeoutMillis:5_000,keepAlive:true,application_name:'pico-criollo',statement_timeout:30_000,query_timeout:35_000,idle_in_transaction_session_timeout:30_000,ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:true}:undefined});
  // Sin este manejador, un error en una conexión inactiva (reinicio de Postgres) tumba el proceso de Node.
  created.on('error',error=>console.error('[pg-pool]',error.message));
  poolGlobal.__picoCriolloPgPool=created;
  return created;
}
export const pool=new Proxy({} as Pool,{get(_target,key){const active=getPool(),value=Reflect.get(active,key,active);return typeof value==='function'?value.bind(active):value;}});
