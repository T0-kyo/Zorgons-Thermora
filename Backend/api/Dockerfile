FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /App

COPY api.csproj .

RUN dotnet restore

COPY . .

RUN dotnet publish -c Release -o ./Publish

# DuckDB's httpfs extension (reads the Parquet files over HTTPS), bundled so a cold start does not
# download it. Must match the DuckDB version inside DuckDB.NET.Data.Full (1.5.6.1 -> v1.5.6).
# If this download fails the build still succeeds and the app installs httpfs at start-up instead.
ARG DUCKDB_VERSION=v1.5.6
ARG DUCKDB_PLATFORM=linux_amd64
RUN mkdir -p /App/duckdb_extensions/${DUCKDB_VERSION}/${DUCKDB_PLATFORM} \
 && (curl -fsSL http://extensions.duckdb.org/${DUCKDB_VERSION}/${DUCKDB_PLATFORM}/httpfs.duckdb_extension.gz \
     | gunzip > /App/duckdb_extensions/${DUCKDB_VERSION}/${DUCKDB_PLATFORM}/httpfs.duckdb_extension \
     || (echo "httpfs not bundled; it will be installed at start-up" \
         && rm -f /App/duckdb_extensions/${DUCKDB_VERSION}/${DUCKDB_PLATFORM}/httpfs.duckdb_extension))

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /App

COPY --from=build /App/Publish .
COPY --from=build /App/duckdb_extensions /App/duckdb_extensions

ENV DataSettings__ExtensionDirectory=/App/duckdb_extensions
ENV DataSettings__TempDirectory=/tmp/duckdb_spill

EXPOSE 5042

ENTRYPOINT ["dotnet", "api.dll"]
