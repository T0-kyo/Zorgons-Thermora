using System.Collections.Concurrent;
using api.Config;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace api.Services;

/// <summary>
/// Response cache with two guarantees the plain IMemoryCache calls did not give:
///  - identical requests that arrive together run the query ONCE (the frontend opens with a
///    burst of ~10 parallel calls; before, each one ran its own query);
///  - the cache has a size limit, so arbitrary lat/lng values cannot grow memory without bound.
/// Failures are not cached.
/// </summary>
public sealed class QueryCache
{
    private readonly IMemoryCache _cache;
    private readonly TimeSpan _ttl;
    private readonly ConcurrentDictionary<string, Lazy<Task<object>>> _inFlight = new();

    public QueryCache(IMemoryCache cache, IOptions<DataSettings> options)
    {
        _cache = cache;
        _ttl = TimeSpan.FromMinutes(Math.Max(1, options.Value.CacheMinutes));
    }

    public async Task<T> GetOrCreateAsync<T>(string key, Func<Task<T>> factory, TimeSpan? ttl = null)
    {
        if (_cache.TryGetValue(key, out T? hit) && hit is not null) return hit;

        var lazy = _inFlight.GetOrAdd(key, k => new Lazy<Task<object>>(async () =>
        {
            try
            {
                var value = (await factory())!;
                _cache.Set(k, value, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = ttl ?? _ttl });
                return value;
            }
            finally
            {
                _inFlight.TryRemove(k, out _);
            }
        }));
        return (T)await lazy.Value;
    }
}
