FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY PicoCriollo.sln ./
COPY Domain/PicoCriollo.Domain.csproj Domain/
COPY Infrastructure/PicoCriollo.Infrastructure.csproj Infrastructure/
COPY Persistence/PicoCriollo.Persistence.csproj Persistence/
COPY API/PicoCriollo.API.csproj API/
RUN dotnet restore API/PicoCriollo.API.csproj
COPY Domain Domain
COPY Infrastructure Infrastructure
COPY Persistence Persistence
COPY API API
RUN dotnet publish API/PicoCriollo.API.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runner
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN mkdir -p /app/media-jobs && chown $APP_UID:$APP_UID /app/media-jobs
ENV ASPNETCORE_URLS=http://+:8080 DOTNET_NOLOGO=1
COPY --from=build /app ./
# La imagen de ASP.NET trae un usuario sin privilegios (APP_UID).
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "PicoCriollo.API.dll"]
