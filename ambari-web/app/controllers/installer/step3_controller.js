/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var App = require('app');

App.InstallerStep3Controller = Em.ArrayController.extend({
  name: 'installerStep3Controller',
  content: [],
  bootHosts: [],
  isSubmitDisabled: false,
  categories: ['Hosts', 'Succeeded', 'Failed'],
  category: 'Hosts',
  allChecked: true,

  onAllChecked: function () {
    var hosts = this.visibleHosts();
    if (this.get('allChecked') === true) {
      hosts.setEach('isChecked', true);
    } else {
      hosts.setEach('isChecked', false);
    }
  }.observes('allChecked'),

  mockData: require('data/mock/step3_hosts'),
  mockRetryData: require('data/mock/step3_pollData'),

  navigateStep: function () {
    this.loadStep();
    if (App.db.getBootStatus() === false) {
      this.startBootstrap();
    }
  },

  clearStep: function () {
    this.clear();
  },

  loadStep: function () {
    console.log("TRACE: Loading step3: Confirm Hosts");
    this.clearStep();
    var hosts = this.loadHosts();
    // hosts.setEach('bootStatus', 'pending');
    this.renderHosts(hosts);
  },

  /* Loads the hostinfo from localStorage on the insertion of view. It's being called from view */
  loadHosts: function () {
    var hostInfo = [];
    hostInfo = App.db.getHosts();
    var hosts = new Ember.Set();
    for (var index in hostInfo) {
      hosts.add(hostInfo[index]);
      console.log("TRACE: host name is: " + hostInfo[index].name);
    }

    return hosts;
  },

  /* renders the set of passed hosts */

  renderHosts: function (hostsInfo) {
    var self = this;
    hostsInfo.forEach(function (_hostInfo) {
      var hostInfo = App.HostInfo.create({
        name: _hostInfo.name,
        bootStatus: _hostInfo.bootStatus
      });

      console.log('pushing ' + hostInfo.name);
      self.content.pushObject(hostInfo);
    });
  },

  /* Below function parses and updates the content, and governs the possibility
   of the next doBootstrap (polling) call
   */

  parseHostInfo: function (hostsFrmServer, hostsFrmContent) {
    var result = true;                    // default value as true implies if the data rendered by REST API has no hosts, polling will stop
    hostsFrmServer.forEach(function (_hostFrmServer) {
      var host = hostsFrmContent.findProperty('name', _hostFrmServer.name);
      if (host !== null && host !== undefined) { // check if hostname extracted from REST API data matches any hostname in content
        host.set('bootStatus', _hostFrmServer.status);
        host.set('cpu', _hostFrmServer.cpu);
        host.set('memory', _hostFrmServer.memory);
      }
    });
    result = !this.content.someProperty('bootStatus', 'pending');
    return result;
  },

  /* Below function returns the current set of visible hosts on view (All,succeded,failed) */
  visibleHosts: function () {
    var result;
    if (this.get('category') === 'Succeeded') {
      return (this.filterProperty('bootStatus', 'success'));
    } else if (this.get('category') === 'Failed') {
      return (this.filterProperty('bootStatus', 'error'));
    } else if (this.get('category') === 'Hosts') {
      return this.content;
    }
  },

  /* Below function removes a single element on the trash icon click. Being called from view */
  removeElement: function (hostInfo) {
    console.log('TRACE: In removeElement');
    var hosts = [hostInfo];
    App.db.removeHosts(hosts);    // remove from localStorage
    this.removeObject(hostInfo);     // remove from the content to rerender the view
  },


  retry: function () {
    if (this.get('isSubmitDisabled')) {
      return;
    }
    var hosts = this.visibleHosts();
    var selectedHosts = hosts.filterProperty('isChecked', true);
    selectedHosts.forEach(function (_host) {
      console.log('Retrying:  ' + _host.name);
    });

    //TODO: uncomment below code to hookup with @GET bootstrap API
    /*
     this.set('bootHosts',selectedHosts);
     this.doBootstrap();
     */

  },

  removeHosts: function (hosts) {
    App.db.removeHosts(hosts);
    this.removeObjects(hosts);
  },

  removeBtn: function () {
    if (this.get('isSubmitDisabled')) {
      return;
    }
    var hostResult = this.visibleHosts();
    var selectedHosts = hostResult.filterProperty('isChecked', true);
    selectedHosts.forEach(function (_hostInfo) {
      console.log('Removing:  ' + _hostInfo.name);
    });

    this.removeHosts(selectedHosts);
  },


  startBootstrap: function () {
    this.set('isSubmitDisabled', true);
    this.set('bootHosts', this.get('content'));
    this.doBootstrap();
  },

  doBootstrap: function () {
    var self = this;
    $.ajax({
      type: 'GET',
      url: '/ambari_server/api/bootstrap',
      async: false,
      timeout: 5000,
      success: function (data) {
        console.log("TRACE: In success function for the GET bootstrap call");
        var result = self.parseHostInfo(data, this.get('bootHosts'));
        if (result !== true && App.router.getInstallerCurrentStep() === '3') {
          window.setTimeout(self.doBootstrap, 3000);
        } else {
          self.stopBootstrap();
        }
      },

      error: function () {
        console.log("ERROR");
        self.stopBootstrap();
      },

      statusCode: {
        404: function () {
          console.log("URI not found.");
        }
      },

      dataType: 'application/json'
    });

  },

  stopBootstrap: function () {
    //TODO: uncomment following line after the hook up with the API call
    // this.set('isSubmitDisabled',false);
  },

  saveHostInfoToDb: function () {
    var hostInfo = {};
    this.forEach(function (_host) {
      hostInfo[_host.name] = {
        name: _host.name,
        cpu: _host.cpu,
        memory: _host.memory,
        bootStatus: _host.bootStatus
      };
    });
    App.db.setHosts(hostInfo);
  },

  submit: function () {
    if (!this.get('isSubmitDisabled')) {
      this.saveHostInfoToDb();
      App.router.send('next');
    }
  },
  hostLogPopup: function (event) {
    App.ModalPopup.show({
      header: Em.I18n.t('installer.step3.hostLog.popup.header'),
      onPrimary: function () {
        this.hide();
      },
      bodyClass: Ember.View.extend({
        templateName: require('templates/installer/step3HostLogPopup')
      })
    });
  },

  // TODO: dummy button. Remove this after the hook up with actual REST API.
  mockBtn: function () {
    this.set('isSubmitDisabled', false);
    this.clear();
    var hostInfo = this.mockData;
    this.renderHosts(hostInfo);
  },

  pollBtn: function () {
    if (this.get('isSubmitDisabled')) {
      return;
    }
    var hosts = this.visibleHosts();
    var selectedHosts = hosts.filterProperty('isChecked', true);
    selectedHosts.forEach(function (_host) {
      console.log('Retrying:  ' + _host.name);
    });

    var mockHosts = this.mockRetryData;
    mockHosts.forEach(function (_host) {
      console.log('Retrying:  ' + _host.name);
    });
    if (this.parseHostInfo(mockHosts, selectedHosts)) {
      // this.saveHostInfoToDb();
    }
  }

});

