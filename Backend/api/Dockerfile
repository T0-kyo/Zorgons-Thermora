FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /App

COPY api.csproj .

RUN dotnet restore

COPY . .

RUN dotnet publish -c Release -o ./Publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /App

COPY --from=build /App/Publish .

EXPOSE 8080

ENTRYPOINT ["dotnet", "api.dll"]