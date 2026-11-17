using System.Text.Json.Nodes;
using PicoCriollo.Domain.DTOs.GranjaD;
using PicoCriollo.Domain.Excepciones;
using PicoCriollo.Domain.Utilidades;
using static PicoCriollo.Domain.Utilidades.ReglasGranja;

namespace PicoCriollo.Persistence.Commands
{
    /// <summary>
    /// Clientes, productos propios, lotes de huevos y ventas con su recibo. Antes estas reglas vivían en el navegador (traceability.ts y useFarm):
    /// ahora cada venta descuenta del lote o del ave en el servidor, es idempotente por clave y se puede cancelar, abonar o devolver sin descuadrar nada.
    /// </summary>
    public partial class GranjaCommands
    {
        private static readonly string[] ProductosDeVenta = ["Huevo fértil", "Huevo consumo", "Pollito", "Ave adulta", "Otro"];
        private static readonly string[] EstadosDePagoNuevos = ["Pendiente", "Parcial", "Pagado"];
        private static readonly string[] EstadosFertilidad = ["Pendiente", "Confirmada", "No confirmada", "No fértil"];
        private static readonly string[] DestinosDeHuevos = ["Venta", "Consumo", "Incubación"];

        private static decimal Num(JsonObject fila, string clave) => DocumentoGranja.Numero(fila[clave]);
        private static int Ent(JsonObject fila, string clave) => (int)Num(fila, clave);

        // ---------- clientes ----------

        public Task<RegistroGuardadoDto> CrearClienteAsync(Guid usuario, ClienteDto dto) => Modificar(usuario, "Cliente registrado.", (doc, _) =>
            Task.FromResult(Insertar(doc, "customers", "cli", "CLI", CamposCliente(dto))));

        public Task<RegistroGuardadoDto> ActualizarClienteAsync(Guid usuario, string id, ClienteDto dto) => Modificar(usuario, "Cliente actualizado.", (doc, _) =>
        {
            JsonObject fila = Fila(doc, "customers", id);
            Fusionar(fila, CamposCliente(dto));
            return Task.FromResult((id, Codigo(fila)));
        });

        public Task<RegistroGuardadoDto> EliminarClienteAsync(Guid usuario, string id) => Modificar(usuario, "Cliente eliminado.", (doc, _) =>
        {
            Fila(doc, "customers", id);
            if (Alguna(doc, "sales", v => Texto(v, "customerId") == id)) throw ReglaNegocioException.Conflicto("Este cliente tiene ventas registradas: se conserva para no perder el historial.");
            doc.Quitar("customers", id);
            return Task.FromResult((id, (string?)null));
        });

        private static JsonObject CamposCliente(ClienteDto d) => new()
        {
            ["name"] = Obligatorio(d.Name, "Nombre"), ["phone"] = ReglasGranja.Texto(d.Phone), ["contact"] = ReglasGranja.Texto(d.Contact), ["notes"] = ReglasGranja.Texto(d.Notes),
        };

        // ---------- productos propios (catálogo) ----------

        public Task<RegistroGuardadoDto> CrearProductoAsync(Guid usuario, ProductoDto dto) => Modificar(usuario, "Producto agregado al catálogo.", (doc, _) =>
            Task.FromResult(Insertar(doc, "customProducts", "product", "PRO", CamposProducto(dto))));

        public Task<RegistroGuardadoDto> ActualizarProductoAsync(Guid usuario, string id, ProductoDto dto) => Modificar(usuario, "Producto actualizado.", (doc, _) =>
        {
            JsonObject fila = Fila(doc, "customProducts", id);
            Fusionar(fila, CamposProducto(dto));
            return Task.FromResult((id, Codigo(fila)));
        });

        public Task<RegistroGuardadoDto> EliminarProductoAsync(Guid usuario, string id) => Modificar(usuario, "Producto eliminado.", (doc, _) =>
        {
            Fila(doc, "customProducts", id);
            if (Alguna(doc, "sales", v => v["lines"] is JsonArray lineas && lineas.OfType<JsonObject>().Any(l => Texto(l, "sourceLotId") == id)))
                throw ReglaNegocioException.Conflicto("Este producto ya se vendió: se conserva para no perder el historial.");
            doc.Quitar("customProducts", id);
            return Task.FromResult((id, (string?)null));
        });

        private static JsonObject CamposProducto(ProductoDto d) => new()
        {
            ["name"] = Obligatorio(d.Name, "Nombre"),
            ["category"] = ReglasGranja.Texto(d.Category) is { Length: > 0 } c ? c : "Otros",
            ["unit"] = Obligatorio(d.Unit, "Unidad"),
            ["price"] = Cantidad(d.Price, "Precio", 0),
            ["available"] = Cantidad(d.Available, "Existencia", 0),
        };

        // ---------- lotes de huevos ----------

        /// <summary>Asigna a un lote parte de los huevos de una recolección que quedaron para venta, consumo o incubación.</summary>
        public Task<RegistroGuardadoDto> CrearLoteHuevosAsync(Guid usuario, LoteHuevosNuevoDto dto) => Modificar(usuario, "Lote creado; fertilidad pendiente.", (doc, _) =>
        {
            JsonObject recoleccion = doc.Buscar("eggs", dto.CollectionId) ?? throw ReglaNegocioException.Validacion("La recolección no existe.");
            string destino = Opcion(dto.Destination, DestinosDeHuevos, "Destino", "Venta");
            int presupuesto = destino == "Venta" ? Ent(recoleccion, "sale") : destino == "Consumo" ? Ent(recoleccion, "consumption") : Ent(recoleccion, "incubation");
            int asignado = doc.Lista("fertileLots").OfType<JsonObject>().Where(l => Texto(l, "sourceCollectionId") == dto.CollectionId && Texto(l, "parentLotId").Length == 0 && Texto(l, "sourceDestination") == destino).Sum(l => Ent(l, "initial"));
            if (dto.Quantity <= 0 || asignado + dto.Quantity > presupuesto)
                throw ReglaNegocioException.Validacion($"La recolección tiene {presupuesto - asignado} huevos de {destino.ToLowerInvariant()} sin asignar a lotes.");
            string grupoId = Referencia(doc, "breedingGroups", dto.BreedingGroupId, "El grupo reproductor elegido ya no existe.");
            if (grupoId.Length == 0) grupoId = Texto(recoleccion, "breedingGroupId");
            JsonObject? grupo = doc.Buscar("breedingGroups", grupoId);
            string raza = ReglasGranja.Texto(dto.Breed) is { Length: > 0 } r ? r : grupo is not null && Texto(grupo, "breed") is { Length: > 0 } rg ? rg : "Sin clasificar";
            var lote = new JsonObject
            {
                ["id"] = DocumentoGranja.NuevoId("fer"), ["code"] = doc.CodigoUnico("FER"), ["sourceCollectionId"] = dto.CollectionId, ["sourceDestination"] = destino,
                ["productType"] = destino == "Consumo" ? "Huevo consumo" : "Huevo fértil", ["date"] = Texto(recoleccion, "date"), ["coopId"] = Texto(recoleccion, "coopId"),
                ["breed"] = raza, ["initial"] = dto.Quantity, ["available"] = dto.Quantity, ["sold"] = 0, ["incubated"] = 0, ["discarded"] = 0,
                ["fertility"] = "Pendiente", ["storageNotes"] = string.Empty, ["notes"] = string.Empty,
            };
            if (grupoId.Length > 0) lote["breedingGroupId"] = grupoId;
            if (recoleccion["groupSnapshot"] is JsonObject foto) lote["groupSnapshot"] = foto.DeepClone();
            else if (grupo is not null) lote["groupSnapshot"] = new JsonObject { ["roosterId"] = Texto(grupo, "roosterId"), ["henIds"] = grupo["henIds"]?.DeepClone() ?? new JsonArray() };
            doc.Lista("fertileLots").Insert(0, lote);
            Movimiento(doc, Texto(recoleccion, "date"), Texto(lote, "id"), "Recolectado", dto.Quantity, dto.CollectionId, $"Procede de {(Texto(recoleccion, "code") is { Length: > 0 } cr ? cr : dto.CollectionId)}; fertilidad pendiente.");
            return Task.FromResult((Texto(lote, "id"), (string?)Texto(lote, "code")));
        });

        public Task<RegistroGuardadoDto> DividirLoteHuevosAsync(Guid usuario, string id, DividirLoteDto dto) => Modificar(usuario, "Sublote creado; su procedencia quedó vinculada.", (doc, ahora) =>
        {
            JsonObject origen = Fila(doc, "fertileLots", id);
            if (dto.Quantity <= 0 || dto.Quantity > Ent(origen, "available")) throw ReglaNegocioException.Validacion("La división debe ser una cantidad entera disponible en el lote.");
            origen["available"] = Ent(origen, "available") - dto.Quantity;
            JsonObject hijo = (JsonObject)origen.DeepClone();
            hijo["id"] = DocumentoGranja.NuevoId("lot");
            hijo["code"] = doc.CodigoUnico("FER");
            hijo["parentLotId"] = id;
            hijo["initial"] = dto.Quantity; hijo["available"] = dto.Quantity; hijo["sold"] = 0; hijo["incubated"] = 0; hijo["discarded"] = 0;
            doc.Lista("fertileLots").Insert(0, hijo);
            Movimiento(doc, Hoy(null, ahora), id, "Dividido", dto.Quantity, Texto(hijo, "id"), $"Sublote {Texto(hijo, "code")}");
            return Task.FromResult((Texto(hijo, "id"), (string?)Texto(hijo, "code")));
        });

        public Task<RegistroGuardadoDto> ActualizarLoteHuevosAsync(Guid usuario, string id, LoteHuevosCambioDto dto) => Modificar(usuario, "Datos del lote actualizados.", (doc, ahora) =>
        {
            JsonObject lote = Fila(doc, "fertileLots", id);
            string fertilidad = OpcionObligatoria(dto.Fertility, EstadosFertilidad, "Fertilidad");
            bool cambio = Texto(lote, "fertility") != fertilidad;
            lote["fertility"] = fertilidad;
            lote["storageNotes"] = ReglasGranja.Texto(dto.StorageNotes);
            if (cambio) Movimiento(doc, Hoy(null, ahora), id, "Clasificado", 0, id, $"Fertilidad actualizada: {fertilidad}.");
            return Task.FromResult((id, Codigo(lote)));
        });

        private static void Movimiento(DocumentoGranja doc, string fecha, string loteId, string tipo, decimal cantidad, string referencia, string notas) =>
            doc.Lista("lotMovements").Insert(0, new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["date"] = fecha, ["lotId"] = loteId, ["kind"] = tipo, ["quantity"] = cantidad, ["referenceId"] = referencia, ["notes"] = notas });

        /// <summary>Al crear una incubación con lotes de huevos, la cantidad inicial se descuenta de los lotes (en el orden elegido).</summary>
        private static void ConsumirLotesDeHuevos(DocumentoGranja doc, List<string> lotes, int cantidad, string incubacionId, string fecha)
        {
            var filas = lotes.Select(l => doc.Buscar("fertileLots", l) ?? throw ReglaNegocioException.Validacion($"El lote de huevos {l} ya no existe.")).ToList();
            if (cantidad <= 0 || filas.Sum(l => Ent(l, "available")) < cantidad) throw ReglaNegocioException.Validacion("Los lotes seleccionados no tienen suficientes huevos disponibles.");
            int restante = cantidad;
            foreach (JsonObject lote in filas)
            {
                int usados = Math.Min(restante, Ent(lote, "available"));
                if (usados == 0) continue;
                lote["available"] = Ent(lote, "available") - usados;
                lote["incubated"] = Ent(lote, "incubated") + usados;
                Movimiento(doc, fecha, Texto(lote, "id"), "Incubado", usados, incubacionId, $"Incubación {incubacionId}");
                restante -= usados;
                if (restante == 0) break;
            }
        }

        // ---------- ventas ----------

        public Task<RegistroGuardadoDto> RegistrarVentaAsync(Guid usuario, VentaNuevaDto d) => Modificar(usuario, "Venta confirmada y recibo generado.", async (doc, ahora) =>
        {
            // Idempotente: repetir la misma clave (un corte de red, un doble toque) devuelve la venta ya registrada.
            JsonObject? previa = doc.Lista("sales").OfType<JsonObject>().FirstOrDefault(v => Texto(v, "idempotencyKey") == d.IdempotencyKey);
            if (previa is not null) return (Texto(previa, "id"), Codigo(previa));

            string fecha = Fecha(d.Date, "Fecha", true);
            string clienteId = ReglasGranja.Texto(d.CustomerId);
            JsonObject? cliente = clienteId.Length == 0 ? null : doc.Buscar("customers", clienteId) ?? throw ReglaNegocioException.Validacion("El cliente no existe.");
            if (d.Lines.Count == 0) throw ReglaNegocioException.Validacion("Agrega al menos un producto a la venta.");
            foreach (LineaVentaDto l in d.Lines)
                if (l.Quantity <= 0 || l.UnitPrice < 0 || l.Discount < 0 || l.Discount > l.Quantity * l.UnitPrice) throw ReglaNegocioException.Validacion("Revisa cantidad, precio y descuento de cada línea.");
            decimal total = d.Lines.Sum(l => Math.Max(0, l.Quantity * l.UnitPrice - l.Discount));
            string estadoPago = OpcionObligatoria(d.PaymentStatus, EstadosDePagoNuevos, "Estado del pago");
            if (d.Paid < 0 || d.Paid > total) throw ReglaNegocioException.Validacion("El abono no puede ser negativo ni superar el total de la venta.");
            if ((estadoPago == "Pagado" && d.Paid != total) || (estadoPago == "Pendiente" && d.Paid != 0) || (estadoPago == "Parcial" && (d.Paid <= 0 || d.Paid >= total)))
                throw ReglaNegocioException.Validacion("El estado del pago no coincide con el abono registrado.");
            string medio = ReglasGranja.Texto(d.PaymentMethod).Length > 0 ? ReglasGranja.Texto(d.PaymentMethod) : (d.Paid > 0 ? "Efectivo" : string.Empty);
            decimal recibido = d.Tendered ?? d.Paid;
            if (medio == "Efectivo" && estadoPago == "Pagado" && recibido < total) throw ReglaNegocioException.Validacion("El efectivo recibido debe cubrir el total, o registra la venta como parcial.");

            string id = DocumentoGranja.NuevoId("ven"), codigo = doc.CodigoUnico("VEN"), creada = JsonMercado(ahora);
            var lineas = new JsonArray();
            foreach (LineaVentaDto l in d.Lines)
                lineas.Add(await AplicarLineaAsync(doc, l, fecha, codigo, id));

            var venta = new JsonObject
            {
                ["id"] = id, ["code"] = codigo, ["receiptCode"] = doc.CodigoUnico("REC"), ["createdAt"] = creada, ["date"] = fecha, ["customerId"] = clienteId,
                ["lines"] = lineas, ["paymentStatus"] = estadoPago, ["paymentMethod"] = medio, ["paid"] = d.Paid, ["notes"] = ReglasGranja.Texto(d.Notes), ["idempotencyKey"] = d.IdempotencyKey,
                ["payments"] = d.Paid > 0 ? new JsonArray(new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["date"] = creada, ["amount"] = d.Paid, ["method"] = medio, ["notes"] = "Pago inicial" }) : new JsonArray(),
            };
            decimal subtotal = d.Lines.Sum(l => l.Quantity * l.UnitPrice), descuento = d.Lines.Sum(l => l.Discount);
            venta["receiptSnapshot"] = new JsonObject
            {
                ["farmName"] = ReglasGranja.Texto(d.FarmName) is { Length: > 0 } nombre ? nombre : "Pico Criollo", ["customerName"] = cliente is null ? "Cliente ocasional" : Texto(cliente, "name"),
                ["createdAt"] = creada, ["subtotal"] = subtotal, ["discount"] = descuento, ["total"] = total, ["paid"] = d.Paid, ["tendered"] = recibido,
                ["change"] = medio == "Efectivo" ? Math.Max(0, recibido - total) : 0, ["paymentMethod"] = medio, ["paymentStatus"] = estadoPago, ["notes"] = ReglasGranja.Texto(d.Notes), ["lines"] = lineas.DeepClone(),
            };
            doc.Lista("sales").Insert(0, venta);
            return (id, (string?)codigo);
        });

        private static string JsonMercado(DateTime ahora) => PicoCriollo.Domain.Mercado.JsonMercado.Iso(ahora);

        /// <summary>Descuenta lo vendido de su lote o de su ave y devuelve la línea tal como queda guardada.</summary>
        private async Task<JsonObject> AplicarLineaAsync(DocumentoGranja doc, LineaVentaDto l, string fecha, string codigoVenta, string ventaId)
        {
            string producto = OpcionObligatoria(l.Product, ProductosDeVenta, "Producto");
            string lote = ReglasGranja.Texto(l.SourceLotId), aveId = ReglasGranja.Texto(l.BirdId);
            var linea = new JsonObject
            {
                ["id"] = DocumentoGranja.NuevoId("line"), ["product"] = producto, ["sourceLotId"] = lote, ["description"] = ReglasGranja.Texto(l.Description),
                ["quantity"] = l.Quantity, ["unit"] = ReglasGranja.Texto(l.Unit) is { Length: > 0 } u ? u : "unidad", ["unitPrice"] = l.UnitPrice, ["discount"] = l.Discount,
            };
            if (producto is "Ave adulta" or "Pollito" && aveId.Length > 0)
            {
                JsonObject ave = doc.Buscar("birds", aveId) ?? throw ReglaNegocioException.Conflicto(producto == "Ave adulta" ? "El ave no está disponible para la venta." : "El pollito individual no está disponible para la venta.");
                if (l.Quantity != 1 || EstadosAveBloqueadosParaVenta.Contains(Texto(ave, "status")) || (producto == "Pollito" && Texto(ave, "sex") != "Pollito"))
                    throw ReglaNegocioException.Conflicto(producto == "Ave adulta" ? "El ave no está disponible para la venta." : "El pollito individual no está disponible para la venta.");
                if (await _mercado.AveEnMercadoAsync(aveId)) throw ReglaNegocioException.Conflicto($"«{Texto(ave, "name")}» está en el mercado. Retira la publicación antes de venderla.");
                linea["birdId"] = aveId;
                linea["priorBirdStatus"] = Texto(ave, "status");
                linea["sourceCode"] = Texto(ave, "code");
                if (Texto(linea, "description").Length == 0) linea["description"] = $"{(producto == "Ave adulta" ? "Ave" : "Pollito")} {Texto(ave, "name")} · {Texto(ave, "code")}";
                ave["status"] = "Vendido";
                RetirarAnilloSiCorresponde(doc, aveId, "Vendido", fecha, $"Retirado por venta {codigoVenta}");
                return linea;
            }
            if (producto == "Ave adulta") throw ReglaNegocioException.Validacion("Selecciona el ave que vendes.");
            if (lote.Length == 0) throw ReglaNegocioException.Validacion(producto == "Pollito" ? "Selecciona un lote de pollitos o un pollito individual." : producto == "Otro" ? "Selecciona un producto del catálogo." : "Selecciona el lote de huevos.");

            if (producto == "Otro")
            {
                JsonObject item = doc.Buscar("customProducts", lote) ?? throw ReglaNegocioException.Conflicto("Selecciona un producto configurable del catálogo.");
                if (l.Quantity > Num(item, "available")) throw ReglaNegocioException.Conflicto($"Solo hay {Num(item, "available")} {Texto(item, "unit")} disponibles de {Texto(item, "name")}.");
                item["available"] = Num(item, "available") - l.Quantity;
                linea["sourceCode"] = Texto(item, "code");
                if (Texto(linea, "description").Length == 0) linea["description"] = Texto(item, "name");
                Movimiento(doc, fecha, lote, "Vendido", l.Quantity, ventaId, $"Venta {codigoVenta}");
                return linea;
            }

            if (l.Quantity != Math.Floor(l.Quantity)) throw ReglaNegocioException.Validacion("Los huevos y los pollitos se venden por unidades enteras.");
            bool pollitos = producto == "Pollito";
            JsonObject origen = doc.Buscar(pollitos ? "chickLots" : "fertileLots", lote) ?? throw ReglaNegocioException.Conflicto("El lote seleccionado no existe.");
            if (!pollitos)
            {
                if (Texto(origen, "sourceDestination") == "Incubación") throw ReglaNegocioException.Conflicto("Este lote se reservó para incubación y no se puede vender.");
                string esperado = producto == "Huevo consumo" ? "Huevo consumo" : "Huevo fértil";
                if (Texto(origen, "productType") != esperado) throw ReglaNegocioException.Conflicto($"El lote seleccionado no corresponde al producto {esperado.ToLowerInvariant()}.");
            }
            int cantidad = (int)l.Quantity;
            if (cantidad > Ent(origen, "available")) throw ReglaNegocioException.Conflicto($"Solo hay {Ent(origen, "available")} unidades disponibles en {Texto(origen, "code")}.");
            linea["sourceCode"] = Texto(origen, "code");
            if (Texto(linea, "description").Length == 0) linea["description"] = $"{producto} {Texto(origen, "breed")} · {Texto(origen, "code")}".Replace("  ", " ");
            origen["available"] = Ent(origen, "available") - cantidad;
            origen["sold"] = Ent(origen, "sold") + cantidad;
            Movimiento(doc, fecha, lote, "Vendido", cantidad, ventaId, $"Venta {codigoVenta}");
            return linea;
        }

        private static readonly string[] EstadosAveBloqueadosParaVenta = ["Vendido", "Fallecido", "Transferido"];

        private static void RetirarAnilloSiCorresponde(DocumentoGranja doc, string aveId, string estado, string fecha, string nota)
        {
            if (estado != "Vendido") return;
            foreach (JsonObject anillo in doc.Lista("rings").OfType<JsonObject>())
                if (Texto(anillo, "birdId") == aveId && Texto(anillo, "status") == "Asignado" && Texto(anillo, "endedAt").Length == 0)
                { anillo["status"] = "Retirado"; anillo["endedAt"] = fecha; anillo["notes"] = nota; }
        }

        public Task<RegistroGuardadoDto> AnularVentaAsync(Guid usuario, string id) => Modificar(usuario, "Venta cancelada con movimientos compensatorios.", (doc, ahora) =>
        {
            JsonObject venta = Fila(doc, "sales", id);
            if (Texto(venta, "paymentStatus") == "Cancelada") return Task.FromResult((id, Codigo(venta)));
            string hoy = Hoy(null, ahora), fechaVenta = Texto(venta, "date"), codigo = Texto(venta, "code");
            foreach (JsonObject linea in (venta["lines"] as JsonArray ?? []).OfType<JsonObject>())
            {
                string producto = Texto(linea, "product"), origen = Texto(linea, "sourceLotId"), aveId = Texto(linea, "birdId");
                decimal cantidad = Num(linea, "quantity");
                if (producto is "Ave adulta" || (producto == "Pollito" && aveId.Length > 0))
                {
                    if (doc.Buscar("birds", aveId) is not { } ave) continue;
                    ave["status"] = Texto(linea, "priorBirdStatus") is { Length: > 0 } previo ? previo : "Activo";
                    Movimiento(doc, hoy, aveId, "Cancelación", cantidad, id, $"Compensación de venta {codigo} · {Texto(ave, "code")}");
                    RestaurarAnillo(doc, aveId, fechaVenta, codigo, hoy);
                }
                else if (producto == "Otro")
                {
                    if (doc.Buscar("customProducts", origen) is not { } item) continue;
                    item["available"] = Num(item, "available") + cantidad;
                    Movimiento(doc, hoy, origen, "Cancelación", cantidad, id, $"Cancelación de venta {codigo}");
                }
                else
                {
                    if (doc.Buscar(producto == "Pollito" ? "chickLots" : "fertileLots", origen) is not { } lote) continue;
                    lote["available"] = Ent(lote, "available") + (int)cantidad;
                    lote["sold"] = Math.Max(0, Ent(lote, "sold") - (int)cantidad);
                    Movimiento(doc, hoy, origen, "Cancelación", cantidad, id, $"Compensación de venta {codigo}");
                }
            }
            venta["paymentStatus"] = "Cancelada";
            venta["refunded"] = Num(venta, "refunded") + Math.Max(0, Num(venta, "paid") - Num(venta, "refunded"));
            return Task.FromResult((id, Codigo(venta)));
        });

        /// <summary>Si el anillo que se retiró por la venta sigue libre, el ave lo recupera.</summary>
        private static void RestaurarAnillo(DocumentoGranja doc, string aveId, string fechaVenta, string codigoVenta, string hoy)
        {
            JsonObject? anterior = doc.Lista("rings").OfType<JsonObject>().FirstOrDefault(r => Texto(r, "birdId") == aveId && Texto(r, "status") == "Retirado" && Texto(r, "endedAt") == fechaVenta && Texto(r, "notes") == $"Retirado por venta {codigoVenta}");
            if (anterior is null || AnilloVigente(doc, Ent(anterior, "number")) is not null) return;
            doc.Lista("rings").Insert(0, new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["number"] = Ent(anterior, "number"), ["birdId"] = aveId, ["status"] = "Asignado", ["assignedAt"] = hoy });
        }

        public Task<RegistroGuardadoDto> RegistrarAbonoAsync(Guid usuario, string id, AbonoDto dto) => Modificar(usuario, "Abono guardado en el historial de pagos.", (doc, ahora) =>
        {
            JsonObject venta = Fila(doc, "sales", id);
            if (Texto(venta, "paymentStatus") is "Cancelada" or "Devuelta") throw ReglaNegocioException.Conflicto("No se pueden registrar abonos en una venta cancelada o devuelta.");
            decimal total = TotalDeVenta(venta), saldo = Math.Max(0, total - Num(venta, "refunded") - Num(venta, "paid"));
            if (saldo == 0) throw ReglaNegocioException.Conflicto("Saldo pendiente en cero.");
            if (dto.Amount <= 0 || dto.Amount > saldo) throw ReglaNegocioException.Validacion($"El abono debe estar entre 1 y {saldo:0.##} COP de saldo pendiente.");
            var pagos = venta["payments"] is JsonArray p ? (JsonArray)p.DeepClone() : new JsonArray();
            pagos.Add(new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["date"] = JsonMercado(ahora), ["amount"] = dto.Amount, ["method"] = Obligatorio(dto.Method, "Medio de pago"), ["notes"] = "Abono registrado" });
            venta["payments"] = pagos;
            venta["paid"] = Num(venta, "paid") + dto.Amount;
            venta["paymentMethod"] = ReglasGranja.Texto(dto.Method);
            venta["paymentStatus"] = Num(venta, "paid") >= total - Num(venta, "refunded") ? "Pagado" : "Parcial";
            return Task.FromResult((id, Codigo(venta)));
        });

        public Task<RegistroGuardadoDto> DevolverLineaAsync(Guid usuario, string id, DevolucionDto dto) => Modificar(usuario, "Devolución registrada con ajuste de existencias.", (doc, ahora) =>
        {
            JsonObject venta = Fila(doc, "sales", id);
            if (Texto(venta, "paymentStatus") is "Cancelada" or "Devuelta") throw ReglaNegocioException.Conflicto("La venta ya está cancelada o devuelta.");
            JsonObject linea = (venta["lines"] as JsonArray ?? []).OfType<JsonObject>().FirstOrDefault(l => Texto(l, "id") == dto.LineId) ?? throw ReglaNegocioException.Validacion("El producto no pertenece a esta venta.");
            decimal restante = Num(linea, "quantity") - Num(linea, "returned");
            if (dto.Quantity <= 0 || dto.Quantity > restante) throw ReglaNegocioException.Validacion($"Solo quedan {restante:0.##} unidades de esta línea para devolver.");
            string producto = Texto(linea, "product"), origen = Texto(linea, "sourceLotId"), aveId = Texto(linea, "birdId");
            if (producto == "Ave adulta" || (producto == "Pollito" && aveId.Length > 0))
            {
                if (doc.Buscar("birds", aveId) is { } ave) ave["status"] = Texto(linea, "priorBirdStatus") is { Length: > 0 } previo ? previo : "Activo";
            }
            else if (producto == "Otro") { if (doc.Buscar("customProducts", origen) is { } item) item["available"] = Num(item, "available") + dto.Quantity; }
            else if (doc.Buscar(producto == "Pollito" ? "chickLots" : "fertileLots", origen) is { } lote)
            {
                lote["available"] = Ent(lote, "available") + dto.Quantity;
                lote["sold"] = Math.Max(0, Ent(lote, "sold") - dto.Quantity);
            }
            linea["returned"] = Num(linea, "returned") + dto.Quantity;
            decimal reembolso = Num(linea, "quantity") > 0 ? (Num(linea, "quantity") * Num(linea, "unitPrice") - Num(linea, "discount")) / Num(linea, "quantity") * dto.Quantity : 0;
            venta["returnedTotal"] = Num(venta, "returnedTotal") + reembolso;
            venta["refunded"] = Num(venta, "refunded") + Math.Min(reembolso, Math.Max(0, Num(venta, "paid") - Num(venta, "refunded")));
            bool todo = (venta["lines"] as JsonArray ?? []).OfType<JsonObject>().All(l => Num(l, "returned") >= Num(l, "quantity"));
            venta["paymentStatus"] = todo ? "Devuelta" : "Devuelta parcial";
            Movimiento(doc, Hoy(null, ahora), origen.Length > 0 ? origen : aveId.Length > 0 ? aveId : "custom", "Devolución", dto.Quantity, id, $"Devolución de {Texto(venta, "code")} · {(Texto(linea, "sourceCode") is { Length: > 0 } c ? c : Texto(linea, "description"))}");
            return Task.FromResult((id, Codigo(venta)));
        });

        private static decimal TotalDeVenta(JsonObject venta) =>
            (venta["lines"] as JsonArray ?? []).OfType<JsonObject>().Sum(l => Math.Max(0, Num(l, "quantity") * Num(l, "unitPrice") - Num(l, "discount")));
    }
}
