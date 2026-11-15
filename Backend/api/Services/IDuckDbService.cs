using DuckDB.NET.Data;

namespace api.Services;

public interface IDuckDbService
{
    /// <summary>
    /// Waits for a free query slot, then hands out a connection to the shared database.
    /// Dispose the lease to close the connection and free the slot.
    /// </summary>
    Task<DuckDbLease> AcquireAsync(CancellationToken ct = default);

    /// <summary>True when no query is running or waiting (used by background work).</summary>
    bool IsIdle { get; }

    string BaseUrl { get; }
    bool IsRemote { get; }

    /// <summary>Full location of a dataset file, relative to BaseUrl.</summary>
    string PathOf(string relative);
}

public sealed class DuckDbLease : IAsyncDisposable, IDisposable
{
    private readonly SemaphoreSlim _gate;
    private int _disposed;

    public DuckDBConnection Connection { get; }

    internal DuckDbLease(DuckDBConnection connection, SemaphoreSlim gate)
    {
        Connection = connection;
        _gate = gate;
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1) return;
        try { Connection.Dispose(); }
        finally { _gate.Release(); }
    }

    public ValueTask DisposeAsync()
    {
        Dispose();
        return ValueTask.CompletedTask;
    }
}
