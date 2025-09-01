using System;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Azure;
using Azure.Data.Tables;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;

namespace SunspotFunctions
{
    public static class SunspotFunctions
    {
        // Table used for daily observations
        private const string TableName = "SunspotDaily";

        // LISIRD JSON endpoint (international sunspot number)
        private const string LisirdUrl = "https://lasp.colorado.edu/lisird/api/international_sunspot_number/time_series?format=json";

        [FunctionName("IngestSunspotsTimer")]
        public static async Task IngestSunspotsTimer([TimerTrigger("0 5 2 * * *")] TimerInfo myTimer, ILogger log)
        {
            log.LogInformation($"IngestSunspotsTimer executed at: {DateTime.UtcNow}");
            try
            {
                await IngestRecentAsync(log);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Ingest failed");
            }
        }

        // Manual backfill via HTTP: /api/sunspots/backfill
        [FunctionName("BackfillSunspots")]
        public static async Task<IActionResult> BackfillSunspots([HttpTrigger(AuthorizationLevel.Function, "post", Route = "sunspots/backfill")] HttpRequest req, ILogger log)
        {
            try
            {
                await IngestAllAsync(log);
                return new OkObjectResult(new { status = "started" });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Backfill failed");
                return new StatusCodeResult(500);
            }
        }

        [FunctionName("GetDailySunspots")]
        public static IActionResult GetDailySunspots([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sunspots/daily")] HttpRequest req, ILogger log)
        {
            try
            {
                var q = req.Query;
                var from = q.ContainsKey("from") ? q["from"].ToString() : null; // yyyy-MM-dd
                var to = q.ContainsKey("to") ? q["to"].ToString() : null;

                var client = GetTableClient();
                client.CreateIfNotExists();

                // Build filter
                string filter = null;
                if (!string.IsNullOrEmpty(from) && !string.IsNullOrEmpty(to))
                {
                    // RowKey is yyyy-MM-dd so lexicographic range works
                    filter = $"RowKey ge '{from}' and RowKey le '{to}'";
                }

                var items = string.IsNullOrEmpty(filter)
                    ? client.Query<TableEntity>()
                    : client.Query<TableEntity>(filter: filter);

                var list = items.Select(e => new { d = e.RowKey, r = e.GetDouble("R") });
                return new OkObjectResult(list);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "GetDailySunspots failed");
                return new StatusCodeResult(500);
            }
        }

        [FunctionName("GetLatestSunspot")]
        public static IActionResult GetLatestSunspot([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "sunspots/latest")] HttpRequest req, ILogger log)
        {
            try
            {
                var client = GetTableClient();
                client.CreateIfNotExists();

                // Query last 1 by RowKey descending across partitions by reading recent years
                // For simplicity, query recent partitions (this could be optimized)
                var now = DateTime.UtcNow;
                var years = Enumerable.Range(now.Year - 2, 3).Reverse();
                foreach (var y in years)
                {
                    var prefix = y.ToString();
                    var items = client.Query<TableEntity>(filter: $"PartitionKey eq '{prefix}'").OrderByDescending(e => e.RowKey).Take(1);
                    var first = items.FirstOrDefault();
                    if (first != null)
                    {
                        return new OkObjectResult(new { d = first.RowKey, r = first.GetDouble("R") });
                    }
                }

                return new NotFoundResult();
            }
            catch (Exception ex)
            {
                log.LogError(ex, "GetLatestSunspot failed");
                return new StatusCodeResult(500);
            }
        }

        // ---- Internal helpers ----
        private static TableClient GetTableClient()
        {
            var conn = Environment.GetEnvironmentVariable("AzureWebJobsStorage");
            if (string.IsNullOrEmpty(conn)) throw new InvalidOperationException("AzureWebJobsStorage not configured");
            return new TableClient(conn, TableName);
        }

        private static async Task IngestRecentAsync(ILogger log)
        {
            // Fetch LISIRD JSON and upsert last 7 days
            using var http = new HttpClient();
            using var resp = await http.GetAsync(LisirdUrl);
            resp.EnsureSuccessStatusCode();
            using var stream = await resp.Content.ReadAsStreamAsync();
            using var doc = await JsonDocument.ParseAsync(stream);

            if (doc.RootElement.ValueKind != JsonValueKind.Array) throw new InvalidOperationException("Unexpected LISIRD JSON shape");

            var points = doc.RootElement.EnumerateArray()
                .Select(e => new
                {
                    date = e.GetProperty("time").GetString()!.Substring(0, 10),
                    value = e.TryGetProperty("value", out var v) && v.ValueKind != JsonValueKind.Null ? v.GetDouble() : (double?)null
                })
                .Where(p => p.value.HasValue)
                .GroupBy(p => p.date)
                .Select(g => g.Last())
                .ToList();

            if (!points.Any())
            {
                log.LogWarning("No points returned from LISIRD");
                return;
            }

            var client = GetTableClient();
            await client.CreateIfNotExistsAsync();

            foreach (var p in points.TakeLast(7))
            {
                var entity = new TableEntity(p.date[..4], p.date)
                {
                    { "R", p.value.Value }
                };
                await client.UpsertEntityAsync(entity, TableUpdateMode.Replace);
            }

            log.LogInformation("Ingested up to {date}", points.Last().date);
        }

        private static async Task IngestAllAsync(ILogger log)
        {
            // Full backfill: fetch entire series and upsert all rows
            using var http = new HttpClient();
            using var resp = await http.GetAsync(LisirdUrl);
            resp.EnsureSuccessStatusCode();
            using var stream = await resp.Content.ReadAsStreamAsync();
            using var doc = await JsonDocument.ParseAsync(stream);

            var points = doc.RootElement.EnumerateArray()
                .Select(e => new
                {
                    date = e.GetProperty("time").GetString()!.Substring(0, 10),
                    value = e.TryGetProperty("value", out var v) && v.ValueKind != JsonValueKind.Null ? v.GetDouble() : (double?)null
                })
                .Where(p => p.value.HasValue)
                .GroupBy(p => p.date)
                .Select(g => g.Last())
                .ToList();

            var client = GetTableClient();
            await client.CreateIfNotExistsAsync();

            foreach (var p in points)
            {
                var entity = new TableEntity(p.date[..4], p.date)
                {
                    { "R", p.value.Value }
                };
                await client.UpsertEntityAsync(entity, TableUpdateMode.Replace);
            }

            log.LogInformation("Backfill complete: inserted {count} rows", points.Count);
        }
    }
}
