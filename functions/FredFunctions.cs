using System;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using System.Collections.Generic;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;

namespace SunspotFunctions
{
    public static class FredFunctions
    {
        // GET /api/fred/yield?start=YYYY-MM-DD&end=YYYY-MM-DD
        [FunctionName("GetYieldSpread")]
        public static async Task<IActionResult> GetYieldSpread([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "fred/yield")] HttpRequest req, ILogger log)
        {
            try
            {
                var start = req.Query.ContainsKey("start") ? req.Query["start"].ToString() : null;
                var end = req.Query.ContainsKey("end") ? req.Query["end"].ToString() : null;

                var apiKey = Environment.GetEnvironmentVariable("FRED_API_KEY");
                if (string.IsNullOrEmpty(apiKey))
                {
                    return new BadRequestObjectResult(new { error = "FRED_API_KEY not configured" });
                }

                using var http = new HttpClient();

                string BuildUrl(string seriesId)
                {
                    var p = new List<string> { $"series_id={seriesId}", "file_type=json", $"api_key={apiKey}" };
                    if (!string.IsNullOrEmpty(start)) p.Add($"observation_start={start}");
                    if (!string.IsNullOrEmpty(end)) p.Add($"observation_end={end}");
                    return $"https://api.stlouisfed.org/fred/series/observations?{string.Join('&', p)}";
                }

                var url10 = BuildUrl("DGS10");
                var url2 = BuildUrl("DGS2");

                var t10 = http.GetAsync(url10);
                var t2 = http.GetAsync(url2);
                await Task.WhenAll(t10, t2);

                var r10 = await t10.Result.Content.ReadAsStringAsync();
                var r2 = await t2.Result.Content.ReadAsStringAsync();

                using var d10 = JsonDocument.Parse(r10);
                using var d2 = JsonDocument.Parse(r2);

                var obs10 = new Dictionary<string, double>();
                if (d10.RootElement.TryGetProperty("observations", out var o10) && o10.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in o10.EnumerateArray())
                    {
                        if (!el.TryGetProperty("date", out var dt) || !el.TryGetProperty("value", out var val)) continue;
                        var ds = dt.GetString();
                        var vs = val.GetString();
                        if (string.IsNullOrEmpty(ds) || string.IsNullOrEmpty(vs) || vs == ".") continue;
                        if (double.TryParse(vs, out var v)) obs10[ds] = v;
                    }
                }

                var obs2 = new Dictionary<string, double>();
                if (d2.RootElement.TryGetProperty("observations", out var o2) && o2.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in o2.EnumerateArray())
                    {
                        if (!el.TryGetProperty("date", out var dt) || !el.TryGetProperty("value", out var val)) continue;
                        var ds = dt.GetString();
                        var vs = val.GetString();
                        if (string.IsNullOrEmpty(ds) || string.IsNullOrEmpty(vs) || vs == ".") continue;
                        if (double.TryParse(vs, out var v)) obs2[ds] = v;
                    }
                }

                var dates = obs10.Keys.Union(obs2.Keys).OrderBy(d => d).ToList();
                var outList = dates.Select(d => new {
                    d,
                    dgs10 = obs10.ContainsKey(d) ? Math.Round(obs10[d], 2) : (double?)null,
                    dgs2 = obs2.ContainsKey(d) ? Math.Round(obs2[d], 2) : (double?)null,
                    v = (obs10.ContainsKey(d) && obs2.ContainsKey(d)) ? Math.Round(obs10[d] - obs2[d], 2) : (double?)null
                }).ToList();

                // Allow CORS from any origin so static site can call this; for production set stricter origin
                try { req.HttpContext.Response.Headers["Access-Control-Allow-Origin"] = "*"; } catch { }

                return new OkObjectResult(outList);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "GetYieldSpread failed");
                return new StatusCodeResult(500);
            }
        }

        // GET /api/fred/recessions
        [FunctionName("GetRecessions")]
        public static async Task<IActionResult> GetRecessions([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "fred/recessions")] HttpRequest req, ILogger log)
        {
            try
            {
                var apiKey = Environment.GetEnvironmentVariable("FRED_API_KEY");
                if (string.IsNullOrEmpty(apiKey))
                {
                    return new BadRequestObjectResult(new { error = "FRED_API_KEY not configured" });
                }

                using var http = new HttpClient();
                var p = new List<string> { $"series_id=GDPC1", "file_type=json", $"api_key={apiKey}" };
                var url = $"https://api.stlouisfed.org/fred/series/observations?{string.Join('&', p)}";
                var resp = await http.GetAsync(url);
                if (!resp.IsSuccessStatusCode) return new StatusCodeResult(502);
                var body = await resp.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(body);
                var obs = new List<(string date, double value)>();
                if (doc.RootElement.TryGetProperty("observations", out var arr) && arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in arr.EnumerateArray())
                    {
                        if (!el.TryGetProperty("date", out var dt) || !el.TryGetProperty("value", out var val)) continue;
                        var ds = dt.GetString();
                        var vs = val.GetString();
                        if (string.IsNullOrEmpty(ds) || string.IsNullOrEmpty(vs) || vs == ".") continue;
                        if (double.TryParse(vs, out var v)) obs.Add((ds, v));
                    }
                }

                // sort by date
                obs = obs.OrderBy(o => o.date).ToList();
                var n = obs.Count;
                if (n < 3) {
                    try { req.HttpContext.Response.Headers["Access-Control-Allow-Origin"] = "*"; } catch { }
                    return new OkObjectResult(new List<object>());
                }

                // compute quarter-over-quarter growth (relative change). mark negative growth quarters
                var neg = new bool[n];
                var growths = new double?[n];
                for (int i = 0; i < n; i++) growths[i] = null;
                for (int i = 1; i < n; i++)
                {
                    var prev = obs[i-1].value;
                    var cur = obs[i].value;
                    if (prev == 0) { neg[i] = false; continue; }
                    var growth = (cur - prev) / prev; // proportion
                    growths[i] = growth;
                    neg[i] = growth < 0;
                }

                // if verbose=true requested, return the raw observations with growth and negative flag for debugging
                var verbose = req.Query.ContainsKey("verbose") && (req.Query["verbose"].ToString().ToLower() == "true");
                if (verbose)
                {
                    var dbg = new List<object>();
                    for (int i = 0; i < n; i++)
                    {
                        dbg.Add(new { date = obs[i].date, value = obs[i].value, growth = growths[i], negative = neg[i] });
                    }
                    try { req.HttpContext.Response.Headers["Access-Control-Allow-Origin"] = "*"; } catch { }
                    return new OkObjectResult(dbg);
                }

                var ranges = new List<object>();
                int iIdx = 1;
                while (iIdx < n)
                {
                    if (!neg[iIdx]) { iIdx++; continue; }
                    // start of a negative run
                    int start = iIdx;
                    int j = iIdx + 1;
                    while (j < n && neg[j]) j++;
                    int runLength = j - start;
                    if (runLength >= 2)
                    {
                        // record recession from obs[start].date to obs[j-1].date
                        ranges.Add(new { start = obs[start].date, end = obs[j-1].date });
                    }
                    iIdx = j;
                }

                try { req.HttpContext.Response.Headers["Access-Control-Allow-Origin"] = "*"; } catch { }
                return new OkObjectResult(ranges);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "GetRecessions failed");
                return new StatusCodeResult(500);
            }
        }
    }
}
