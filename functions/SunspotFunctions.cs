using System;
using System.IO;
using System.Net.Http;
using System.Threading.Tasks;
using Azure;
using Azure.Data.Tables;
using Microsoft.Azure.WebJobs;
using Microsoft.Azure.WebJobs.Extensions.Http;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using Newtonsoft.Json;

namespace SunspotFunctions
{
    public static class SunspotFunctions
    {
        // Expect an app setting named 'AzureWebJobsStorage' with Table access
        private static string TableName = "Sunspots";

        [FunctionName("SunspotTimer")]
        public static async Task RunTimer([TimerTrigger("0 0 6 * * *")] TimerInfo myTimer, ILogger log)
        {
            log.LogInformation($"SunspotTimer executed at: {DateTime.UtcNow}");

            try
            {
                var client = GetTableClient();
                await client.CreateIfNotExistsAsync();

                // Example external API - here we simulate fetching a value.
                // Replace with a real sunspot API endpoint.
                var observedAt = DateTime.UtcNow;
                var value = await FetchSunspotCountAsync();

                var entity = new TableEntity("sunspot", Guid.NewGuid().ToString())
                {
                    { "ObservedAt", observedAt },
                    { "Count", value }
                };

                await client.AddEntityAsync(entity);
                log.LogInformation($"Stored sunspot count {value} for {observedAt}");
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error in SunspotTimer");
            }
        }

        [FunctionName("GetSunspots")]
        public static IActionResult GetSunspots([HttpTrigger(AuthorizationLevel.Function, "get", Route = "sunspots")] HttpRequest req, ILogger log)
        {
            try
            {
                var client = GetTableClient();
                var items = client.Query<TableEntity>(filter: "PartitionKey eq 'sunspot'");
                var list = new System.Collections.Generic.List<object>();
                foreach (var e in items)
                {
                    list.Add(new { id = e.RowKey, observedAt = e.GetDateTime("ObservedAt"), count = e.GetInt32("Count") ?? (int?)null });
                }
                return new OkObjectResult(list);
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Error in GetSunspots");
                return new StatusCodeResult(500);
            }
        }

        private static TableClient GetTableClient()
        {
            var conn = Environment.GetEnvironmentVariable("AzureWebJobsStorage");
            return new TableClient(conn, TableName);
        }

        private static async Task<int> FetchSunspotCountAsync()
        {
            // Placeholder: in production, call a real API.
            await Task.Delay(50);
            var rnd = new Random();
            return rnd.Next(0, 200);
        }
    }
}
