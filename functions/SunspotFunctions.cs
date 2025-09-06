using System;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Globalization;
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
        // Default JSON endpoint (LISIRD). You can override with environment variable SUNSPOT_JSON_URL
        // Example OpenDataSoft SILSO dataset (replace with correct dataset query if you prefer):
        // https://public.opendatasoft.com/api/records/1.0/search/?dataset=silso-daily-total-sunspot-number&rows=10000&sort=-time
        private const string LisirdUrl = "https://lasp.colorado.edu/lisird/api/international_sunspot_number/time_series?format=json";
    // SILSO daily file (text) fallback
    private const string SilsoDailyUrl = "https://www.sidc.be/silso/DATA/SN_d_tot_V2.0.txt";

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
            var debug = req.Query.ContainsKey("debug") && req.Query["debug"] == "1";
            try
            {
                await IngestAllAsync(log);
                return new OkObjectResult(new { status = "started" });
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Backfill failed");
                if (debug)
                {
                    return new ObjectResult(new { error = ex.Message, details = ex.ToString() }) { StatusCode = 500 };
                }
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
                var jsonUrl = Environment.GetEnvironmentVariable("SUNSPOT_JSON_URL");
                if (string.IsNullOrEmpty(jsonUrl)) jsonUrl = LisirdUrl;
                log.LogInformation("Fetching sunspot JSON from {url}", jsonUrl);
                using var resp = await http.GetAsync(jsonUrl);
            resp.EnsureSuccessStatusCode();
            using var stream = await resp.Content.ReadAsStreamAsync();
            using var doc = await JsonDocument.ParseAsync(stream);

            var points = ParseSunspotJsonArray(doc.RootElement, log);

            if (!points.Any())
            {
                log.LogWarning("No points returned from JSON source {url}", jsonUrl);
                return;
            }

            var client = GetTableClient();
            await client.CreateIfNotExistsAsync();

            foreach (var p in points.TakeLast(7))
            {
                var entity = new TableEntity(p.date[..4], p.date)
                {
                    { "R", p.value }
                };
                await client.UpsertEntityAsync(entity, TableUpdateMode.Replace);
            }

            log.LogInformation("Ingested up to {date}", points.Last().date);
        }

        private static async Task IngestAllAsync(ILogger log)
        {
            // Full backfill: fetch entire series and upsert all rows
            try
            {
                using var http = new HttpClient();
                // Add headers to make the request look like a JSON API client
                http.DefaultRequestHeaders.Accept.Clear();
                http.DefaultRequestHeaders.Accept.ParseAdd("application/json");
                if (!http.DefaultRequestHeaders.UserAgent.TryParseAdd("SunspotIngest/1.0 (+https://example.com)")) { }

                var jsonUrl = Environment.GetEnvironmentVariable("SUNSPOT_JSON_URL");
                if (string.IsNullOrEmpty(jsonUrl)) jsonUrl = LisirdUrl;
                log.LogInformation("Fetching sunspot JSON from {url}", jsonUrl);
                using var resp = await http.GetAsync(jsonUrl);
                var raw = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    log.LogError("JSON source {url} returned non-success status {status}: {body}", jsonUrl, resp.StatusCode, raw);
                    resp.EnsureSuccessStatusCode();
                }

                // Quick sanity check: if body starts with '<' it's probably HTML (error page)
                if (!string.IsNullOrEmpty(raw) && raw.TrimStart().StartsWith("<"))
                {
                    log.LogError("JSON source {url} returned HTML instead of JSON: {snippet}", jsonUrl, raw.Length > 800 ? raw[..800] : raw);
                    throw new InvalidOperationException("JSON source returned HTML instead of JSON");
                }

                try
                {
                    using var doc = JsonDocument.Parse(raw);

                    var points = ParseSunspotJsonArray(doc.RootElement, log);

                    // proceed with JSON points
                    var client = GetTableClient();
                    await client.CreateIfNotExistsAsync();

                    foreach (var p in points)
                    {
                        var entity = new TableEntity(p.date[..4], p.date)
                        {
                            { "R", p.value }
                        };
                        await client.UpsertEntityAsync(entity, TableUpdateMode.Replace);
                    }

                    log.LogInformation("Backfill complete: inserted {count} rows (JSON source)", points.Count);
                    return;
                }
                catch (Exception jsonEx)
                {
                    log.LogWarning(jsonEx, "Failed to parse JSON from {url}, attempting SILSO CSV fallback", jsonUrl);
                }

            }
            catch (HttpRequestException hre)
            {
                log.LogError(hre, "HTTP request error while fetching JSON source: {msg}", hre.Message);
                throw;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error during IngestAllAsync: {msg}", ex.Message);
                throw;
            }
        }

        private static async Task<List<(string date, double value)>> FetchSilsoDailyAsync(ILogger log)
        {
            using var http = new HttpClient();
            using var resp = await http.GetAsync(SilsoDailyUrl);
            resp.EnsureSuccessStatusCode();
            var text = await resp.Content.ReadAsStringAsync();

            // SILSO daily format: columns separated by whitespace, lines like:
            // yyyy m d decDate dailyTotal ...
            var lines = text.Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries);
            var list = new List<(string date, double value)>();
            foreach (var line in lines)
            {
                if (line.StartsWith("#")) continue;
                var parts = line.Trim().Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5) continue;
                // parts[0]=year, [1]=month, [2]=day, [4]=daily total
                if (!int.TryParse(parts[0], out var y)) continue;
                if (!int.TryParse(parts[1], out var m)) continue;
                if (!int.TryParse(parts[2], out var d)) continue;
                var date = new DateTime(y, m, d).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                if (double.TryParse(parts[4], NumberStyles.Any, CultureInfo.InvariantCulture, out var val))
                {
                    list.Add((date, val));
                }
            }
            return list;
        }

        // Parse different JSON shapes into (date, value) points.
        // Supports:
        // - LISIRD array of { time: "YYYY-MM-DDTHH:MM:SSZ", value: number }
        // - NOAA/SWPC array of { "time-tag": "YYYY-MM" | "YYYY-MM-DD", "ssn": number }
        private static List<(string date, double value)> ParseSunspotJsonArray(JsonElement root, ILogger log)
        {
            var list = new List<(string date, double value)>();
            if (root.ValueKind != JsonValueKind.Array)
            {
                log.LogWarning("JSON root not an array (was {kind})", root.ValueKind);
                return list;
            }

            foreach (var e in root.EnumerateArray())
            {
                try
                {
                    // Try NOAA/SWPC shape first: time-tag and ssn
                    if (e.TryGetProperty("time-tag", out var tt) && (e.TryGetProperty("ssn", out var ssn) || e.TryGetProperty("predicted_ssn", out ssn)))
                    {
                        var timeTag = tt.GetString();
                        if (string.IsNullOrEmpty(timeTag)) continue;

                        // NOAA provides monthly records as yyyy-mm; convert to 'yyyy-mm-01' for storage
                        var date = timeTag.Length == 7 ? timeTag + "-01" : timeTag.Substring(0, Math.Min(10, timeTag.Length));
                        if (ssn.ValueKind == JsonValueKind.Number && ssn.TryGetDouble(out var v))
                        {
                            list.Add((date, v));
                        }
                        continue;
                    }

                    // LISIRD shape: time and value
                    if (e.TryGetProperty("time", out var t) && e.TryGetProperty("value", out var vprop))
                    {
                        var timestr = t.GetString();
                        if (string.IsNullOrEmpty(timestr)) continue;
                        var date = timestr.Substring(0, Math.Min(10, timestr.Length));
                        if (vprop.ValueKind == JsonValueKind.Number && vprop.TryGetDouble(out var v))
                        {
                            list.Add((date, v));
                        }
                        continue;
                    }

                    // Also support a flat NOAA 'sunspots.json' format where each element has time-tag/ssn
                    if (e.TryGetProperty("time_tag", out var tt2) && e.TryGetProperty("ssn", out var ssn2))
                    {
                        var timeTag = tt2.GetString();
                        if (string.IsNullOrEmpty(timeTag)) continue;
                        var date = timeTag.Length == 7 ? timeTag + "-01" : timeTag.Substring(0, Math.Min(10, timeTag.Length));
                        if (ssn2.ValueKind == JsonValueKind.Number && ssn2.TryGetDouble(out var v))
                        {
                            list.Add((date, v));
                        }
                        continue;
                    }
                }
                catch (Exception ex)
                {
                    log.LogDebug(ex, "Failed to parse JSON element, skipping");
                }
            }

            // Group by date and keep last value per date
            var grouped = list.GroupBy(p => p.date).Select(g => g.Last()).ToList();
            return grouped;
        }
    }
}
